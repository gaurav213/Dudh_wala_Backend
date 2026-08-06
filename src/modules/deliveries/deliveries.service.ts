import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  DeliveryStatus,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import {
  calculateAmount,
  roundMoney,
  roundQty,
} from '../../common/utils/decimal.util';
import { buildPageMeta } from '../../common/utils/pagination.util';
import {
  assertFound,
  assertSupplierOwnership,
  getSupplierIdOrThrow,
} from '../../common/utils/ownership.util';
import { AuditService } from '../audit/audit.service';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { ChangeLog } from '../sync/entities/change-log.entity';
import {
  BulkUpdateDeliveriesDto,
  CreateDeliveryDto,
  GenerateDailyListDto,
  ListDeliveriesDto,
  UpdateDeliveryDto,
} from './dto/delivery.dto';
import { MilkDelivery } from './entities/milk-delivery.entity';

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(MilkSubscription)
    private readonly subsRepo: Repository<MilkSubscription>,
    @InjectRepository(ChangeLog)
    private readonly changeLogRepo: Repository<ChangeLog>,
    private readonly auditService: AuditService,
  ) {}

  async create(user: { id: string; role: UserRole }, dto: CreateDeliveryDto) {
    const existingRef = await this.deliveriesRepo.findOne({
      where: { clientReferenceId: dto.clientReferenceId },
    });
    if (existingRef) return existingRef;

    const subscription = assertFound(
      await this.subsRepo.findOne({ where: { id: dto.subscriptionId } }),
      'Subscription not found',
    );
    assertSupplierOwnership(user, subscription.supplierId, 'subscription');

    const deliveryShift = dto.deliveryShift || subscription.deliveryShift;
    const status = dto.status || DeliveryStatus.PENDING;
    const quantity = this.resolveQuantity(
      status,
      dto.quantity ?? subscription.defaultQuantity,
    );
    const ratePerLitre = roundMoney(subscription.ratePerLitre);
    const amount = this.resolveAmount(status, quantity, ratePerLitre);

    try {
      const delivery = await this.deliveriesRepo.save(
        this.deliveriesRepo.create({
          supplierId: subscription.supplierId,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          deliveryDate: dto.deliveryDate,
          deliveryShift,
          quantity,
          ratePerLitre,
          amount,
          status,
          notes: dto.notes ?? null,
          clientReferenceId: dto.clientReferenceId,
          version: 1,
          createdByUserId: user.id,
        }),
      );
      await this.writeChange(
        delivery.supplierId,
        delivery.id,
        'CREATE',
        delivery.version,
      );
      return delivery;
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(
          'Delivery already exists for subscription/date/shift',
        );
      }
      throw err;
    }
  }

  async findAll(
    user: { id: string; role: UserRole },
    query: ListDeliveriesDto,
  ) {
    const supplierId =
      user.role === UserRole.PLATFORM_OWNER
        ? undefined
        : getSupplierIdOrThrow(user);
    const qb = this.deliveriesRepo.createQueryBuilder('d');
    if (supplierId) qb.andWhere('d.supplier_id = :supplierId', { supplierId });
    if (query.customerId)
      qb.andWhere('d.customer_id = :customerId', {
        customerId: query.customerId,
      });
    if (query.subscriptionId)
      qb.andWhere('d.subscription_id = :subscriptionId', {
        subscriptionId: query.subscriptionId,
      });
    if (query.date)
      qb.andWhere('d.delivery_date = :date', { date: query.date });
    if (query.dateFrom)
      qb.andWhere('d.delivery_date >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere('d.delivery_date <= :dateTo', { dateTo: query.dateTo });
    if (query.status)
      qb.andWhere('d.status = :status', { status: query.status });
    if (query.deliveryShift)
      qb.andWhere('d.delivery_shift = :deliveryShift', {
        deliveryShift: query.deliveryShift,
      });
    qb.orderBy('d.delivery_date', query.sortOrder || 'DESC');
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async findOne(user: { id: string; role: UserRole }, id: string) {
    const delivery = assertFound(
      await this.deliveriesRepo.findOne({ where: { id } }),
      'Delivery not found',
    );
    assertSupplierOwnership(user, delivery.supplierId, 'delivery');
    return delivery;
  }

  async update(
    user: { id: string; role: UserRole },
    id: string,
    dto: UpdateDeliveryDto,
  ) {
    const delivery = await this.findOne(user, id);
    const status = dto.status ?? delivery.status;
    const quantity = this.resolveQuantity(
      status,
      dto.quantity ?? delivery.quantity,
    );
    delivery.status = status;
    delivery.quantity = quantity;
    delivery.amount = this.resolveAmount(
      status,
      quantity,
      delivery.ratePerLitre,
    );
    if (dto.notes !== undefined) delivery.notes = dto.notes ?? null;
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);
    await this.writeChange(saved.supplierId, saved.id, 'UPDATE', saved.version);
    await this.auditService.log({
      actorUserId: user.id,
      supplierId: saved.supplierId,
      entityType: 'DELIVERY',
      entityId: saved.id,
      action: 'DELIVERY_UPDATED',
      newValues: { status: saved.status, quantity: saved.quantity },
    });
    return saved;
  }

  async remove(user: { id: string; role: UserRole }, id: string) {
    const delivery = await this.findOne(user, id);
    delivery.version += 1;
    await this.deliveriesRepo.save(delivery);
    await this.deliveriesRepo.softRemove(delivery);
    await this.writeChange(
      delivery.supplierId,
      delivery.id,
      'DELETE',
      delivery.version,
    );
    return { success: true };
  }

  async generateDailyList(
    user: { id: string; role: UserRole },
    dto: GenerateDailyListDto,
  ) {
    const supplierId = getSupplierIdOrThrow(user);
    const qb = this.subsRepo
      .createQueryBuilder('s')
      .where('s.supplier_id = :supplierId', { supplierId })
      .andWhere('s.status = :status', { status: SubscriptionStatus.ACTIVE })
      .andWhere('s.start_date <= :date', { date: dto.date })
      .andWhere('(s.end_date IS NULL OR s.end_date >= :date)', {
        date: dto.date,
      });
    if (dto.deliveryShift) {
      qb.andWhere('s.delivery_shift = :shift', { shift: dto.deliveryShift });
    }
    const subscriptions = await qb.getMany();
    let created = 0;
    let skipped = 0;
    const deliveries: MilkDelivery[] = [];

    for (const sub of subscriptions) {
      const existing = await this.deliveriesRepo.findOne({
        where: {
          subscriptionId: sub.id,
          deliveryDate: dto.date,
          deliveryShift: sub.deliveryShift,
        },
      });
      if (existing) {
        skipped += 1;
        deliveries.push(existing);
        continue;
      }
      const quantity = roundQty(sub.defaultQuantity);
      const ratePerLitre = roundMoney(sub.ratePerLitre);
      const delivery = await this.deliveriesRepo.save(
        this.deliveriesRepo.create({
          supplierId: sub.supplierId,
          customerId: sub.customerId,
          subscriptionId: sub.id,
          deliveryDate: dto.date,
          deliveryShift: sub.deliveryShift,
          quantity,
          ratePerLitre,
          amount: calculateAmount(quantity, ratePerLitre),
          status: DeliveryStatus.PENDING,
          clientReferenceId: uuidv4(),
          version: 1,
          createdByUserId: user.id,
        }),
      );
      await this.writeChange(
        delivery.supplierId,
        delivery.id,
        'CREATE',
        delivery.version,
      );
      created += 1;
      deliveries.push(delivery);
    }

    return { created, skipped, deliveries };
  }

  async bulkUpdate(
    user: { id: string; role: UserRole },
    dto: BulkUpdateDeliveriesDto,
  ) {
    const results = [];
    for (const item of dto.items) {
      const updated = await this.update(user, item.id, {
        status: item.status,
        quantity: item.quantity,
        notes: item.notes,
      });
      results.push(updated);
    }
    return results;
  }

  private resolveQuantity(status: DeliveryStatus, quantity: string): string {
    if (
      status === DeliveryStatus.SKIPPED ||
      status === DeliveryStatus.CANCELLED
    ) {
      return roundQty(0);
    }
    if (status === DeliveryStatus.DELIVERED && new Decimal(quantity).lte(0)) {
      throw new BadRequestException('DELIVERED requires quantity > 0');
    }
    return roundQty(quantity);
  }

  private resolveAmount(
    status: DeliveryStatus,
    quantity: string,
    rate: string,
  ): string {
    if (
      status === DeliveryStatus.SKIPPED ||
      status === DeliveryStatus.CANCELLED
    ) {
      return roundMoney(0);
    }
    return calculateAmount(quantity, rate);
  }

  private async writeChange(
    supplierId: string,
    entityId: string,
    changeType: string,
    entityVersion: number,
  ) {
    await this.changeLogRepo.save(
      this.changeLogRepo.create({
        supplierId,
        entityType: 'DELIVERY',
        entityId,
        changeType,
        entityVersion,
      }),
    );
  }
}

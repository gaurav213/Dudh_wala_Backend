import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { SubscriptionStatus, UserRole } from '../../common/enums';
import { roundMoney, roundQty } from '../../common/utils/decimal.util';
import { buildPageMeta } from '../../common/utils/pagination.util';
import {
  assertFound,
  assertSupplierOwnership,
  getSupplierIdOrThrow,
} from '../../common/utils/ownership.util';
import { hasActiveSubscriptionOverlap } from '../../common/utils/subscription-overlap.util';
import { CustomersService } from '../customers/customers.service';
import { ChangeLog } from '../sync/entities/change-log.entity';
import {
  CreateSubscriptionDto,
  ListSubscriptionsDto,
  UpdateSubscriptionDto,
} from './dto/subscription.dto';
import { MilkSubscription } from './entities/milk-subscription.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(MilkSubscription)
    private readonly subsRepo: Repository<MilkSubscription>,
    @InjectRepository(ChangeLog)
    private readonly changeLogRepo: Repository<ChangeLog>,
    private readonly customersService: CustomersService,
  ) {}

  async create(
    user: { id: string; role: UserRole },
    dto: CreateSubscriptionDto,
  ) {
    const customer = await this.customersService.findOne(user, dto.customerId);
    this.validateQuantities(dto.defaultQuantity, dto.ratePerLitre);
    this.validateDates(dto.startDate, dto.endDate);
    await this.assertNoOverlap({
      customerId: dto.customerId,
      milkType: dto.milkType,
      deliveryShift: dto.deliveryShift,
      status: SubscriptionStatus.ACTIVE,
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
    });
    const sub = await this.subsRepo.save(
      this.subsRepo.create({
        supplierId: customer.supplierId,
        customerId: dto.customerId,
        milkType: dto.milkType,
        defaultQuantity: roundQty(dto.defaultQuantity),
        ratePerLitre: roundMoney(dto.ratePerLitre),
        deliveryShift: dto.deliveryShift,
        startDate: dto.startDate,
        endDate: dto.endDate ?? null,
        status: SubscriptionStatus.ACTIVE,
        version: 1,
      }),
    );
    await this.writeChange(sub.supplierId, sub.id, 'CREATE', sub.version);
    return sub;
  }

  async findAll(
    user: { id: string; role: UserRole },
    query: ListSubscriptionsDto,
  ) {
    const supplierId =
      user.role === UserRole.PLATFORM_OWNER
        ? undefined
        : getSupplierIdOrThrow(user);
    const qb = this.subsRepo.createQueryBuilder('s');
    if (supplierId) qb.andWhere('s.supplier_id = :supplierId', { supplierId });
    if (query.customerId)
      qb.andWhere('s.customer_id = :customerId', {
        customerId: query.customerId,
      });
    if (query.status)
      qb.andWhere('s.status = :status', { status: query.status });
    qb.orderBy('s.created_at', query.sortOrder || 'DESC');
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async findOne(user: { id: string; role: UserRole }, id: string) {
    const sub = assertFound(
      await this.subsRepo.findOne({ where: { id } }),
      'Subscription not found',
    );
    assertSupplierOwnership(user, sub.supplierId, 'subscription');
    return sub;
  }

  async update(
    user: { id: string; role: UserRole },
    id: string,
    dto: UpdateSubscriptionDto,
  ) {
    const sub = await this.findOne(user, id);
    if (dto.defaultQuantity !== undefined || dto.ratePerLitre !== undefined) {
      this.validateQuantities(
        dto.defaultQuantity ?? sub.defaultQuantity,
        dto.ratePerLitre ?? sub.ratePerLitre,
      );
    }
    const startDate = dto.startDate ?? sub.startDate;
    const endDate =
      dto.endDate !== undefined ? (dto.endDate ?? null) : sub.endDate;
    this.validateDates(startDate, endDate ?? undefined);
    const candidate = {
      id: sub.id,
      customerId: dto.customerId ?? sub.customerId,
      milkType: dto.milkType ?? sub.milkType,
      deliveryShift: dto.deliveryShift ?? sub.deliveryShift,
      status: sub.status,
      startDate,
      endDate,
    };
    if (sub.status === SubscriptionStatus.ACTIVE) {
      await this.assertNoOverlap(candidate);
    }
    Object.assign(sub, {
      ...dto,
      defaultQuantity: dto.defaultQuantity
        ? roundQty(dto.defaultQuantity)
        : sub.defaultQuantity,
      ratePerLitre: dto.ratePerLitre
        ? roundMoney(dto.ratePerLitre)
        : sub.ratePerLitre,
      endDate,
    });
    sub.version += 1;
    const saved = await this.subsRepo.save(sub);
    await this.writeChange(saved.supplierId, saved.id, 'UPDATE', saved.version);
    return saved;
  }

  async pause(user: { id: string; role: UserRole }, id: string) {
    return this.setStatus(user, id, SubscriptionStatus.PAUSED);
  }

  async resume(user: { id: string; role: UserRole }, id: string) {
    const sub = await this.findOne(user, id);
    await this.assertNoOverlap({
      id: sub.id,
      customerId: sub.customerId,
      milkType: sub.milkType,
      deliveryShift: sub.deliveryShift,
      status: SubscriptionStatus.ACTIVE,
      startDate: sub.startDate,
      endDate: sub.endDate,
    });
    return this.setStatus(user, id, SubscriptionStatus.ACTIVE);
  }

  async cancel(user: { id: string; role: UserRole }, id: string) {
    return this.setStatus(user, id, SubscriptionStatus.CANCELLED);
  }

  private async setStatus(
    user: { id: string; role: UserRole },
    id: string,
    status: SubscriptionStatus,
  ) {
    const sub = await this.findOne(user, id);
    sub.status = status;
    sub.version += 1;
    const saved = await this.subsRepo.save(sub);
    await this.writeChange(saved.supplierId, saved.id, 'UPDATE', saved.version);
    return saved;
  }

  private validateQuantities(qty: string, rate: string) {
    if (new Decimal(qty).lte(0)) {
      throw new BadRequestException('defaultQuantity must be greater than 0');
    }
    if (new Decimal(rate).lt(0)) {
      throw new BadRequestException('ratePerLitre must be >= 0');
    }
  }

  private validateDates(startDate: string, endDate?: string) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException('endDate must not be before startDate');
    }
  }

  private async assertNoOverlap(candidate: {
    id?: string;
    customerId: string;
    milkType: string;
    deliveryShift: string;
    status: SubscriptionStatus;
    startDate: string;
    endDate?: string | null;
  }) {
    const existing = await this.subsRepo.find({
      where: {
        customerId: candidate.customerId,
        milkType: candidate.milkType as any,
        deliveryShift: candidate.deliveryShift as any,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    if (hasActiveSubscriptionOverlap(candidate, existing)) {
      throw new ConflictException(
        'Overlapping active subscription exists for customer/milkType/shift',
      );
    }
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
        entityType: 'SUBSCRIPTION',
        entityId,
        changeType,
        entityVersion,
      }),
    );
  }
}

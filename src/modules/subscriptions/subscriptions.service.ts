import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { EntityManager, Repository } from 'typeorm';
import {
  DeliveryAssignmentStatus,
  DeliveryStatus,
  FarmMemberRole,
  FarmMemberStatus,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import { roundMoney, roundQty } from '../../common/utils/decimal.util';
import { buildPageMeta } from '../../common/utils/pagination.util';
import {
  assertFound,
  assertSupplierOwnership,
  getSupplierIdOrThrow,
} from '../../common/utils/ownership.util';
import { hasActiveSubscriptionOverlap } from '../../common/utils/subscription-overlap.util';
import { CustomersService } from '../customers/customers.service';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { DeliveryAssignment } from '../farms/entities/delivery-assignment.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { Farm } from '../farms/entities/farm.entity';
import { ChangeLog } from '../sync/entities/change-log.entity';
import {
  AssignDeliveryPersonDto,
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
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
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
    const qb = this.subsRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'customer')
      .leftJoinAndSelect('s.assignedDeliveryUser', 'assignee');
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
      await this.subsRepo.findOne({
        where: { id },
        relations: ['customer', 'assignedDeliveryUser'],
      }),
      'Subscription not found',
    );
    assertSupplierOwnership(user, sub.supplierId, 'subscription');
    return sub;
  }

  async assignDeliveryPerson(
    user: { id: string; role: UserRole },
    id: string,
    dto: AssignDeliveryPersonDto,
  ) {
    const sub = await this.findOne(user, id);
    const farmId = await this.resolveFarmId(sub);
    const assigneeId =
      dto.assignedDeliveryUserId === undefined
        ? null
        : dto.assignedDeliveryUserId;

    if (assigneeId) {
      await this.assertActiveDeliveryStaff(farmId, assigneeId);
    }

    return this.subsRepo.manager.transaction(async (manager) => {
      return this.applyAssignment(manager, {
        subscription: sub,
        farmId,
        assigneeUserId: assigneeId,
        assignedByUserId: user.id,
      });
    });
  }

  /**
   * Shared assignment write used by the public assign endpoint and by
   * service-request accept (same transaction when a manager is provided).
   */
  async applyAssignment(
    manager: EntityManager,
    params: {
      subscription: MilkSubscription;
      farmId: string;
      assigneeUserId: string | null;
      assignedByUserId: string;
    },
  ) {
    if (params.assigneeUserId) {
      const member = await manager.getRepository(FarmMember).findOne({
        where: {
          farmId: params.farmId,
          userId: params.assigneeUserId,
          memberRole: FarmMemberRole.DELIVERY_STAFF,
          status: FarmMemberStatus.ACTIVE,
        },
      });
      if (!member) {
        throw new BadRequestException(
          'Assignee must be an active delivery staff member of this farm',
        );
      }
    }

    const subsRepo = manager.getRepository(MilkSubscription);
    const assignmentsRepo = manager.getRepository(DeliveryAssignment);
    const deliveriesRepo = manager.getRepository(MilkDelivery);

    const sub = params.subscription;
    sub.assignedDeliveryUserId = params.assigneeUserId;
    sub.farmId = sub.farmId ?? params.farmId;
    sub.version += 1;
    const saved = await subsRepo.save(sub);

    const prior = await assignmentsRepo.find({
      where: {
        subscriptionId: saved.id,
        status: DeliveryAssignmentStatus.ACTIVE,
      },
    });
    for (const row of prior) {
      row.status = DeliveryAssignmentStatus.INACTIVE;
    }
    if (prior.length) await assignmentsRepo.save(prior);

    if (params.assigneeUserId) {
      await assignmentsRepo.save(
        assignmentsRepo.create({
          farmId: params.farmId,
          subscriptionId: saved.id,
          deliveryId: null,
          assigneeUserId: params.assigneeUserId,
          assignedByUserId: params.assignedByUserId,
          status: DeliveryAssignmentStatus.ACTIVE,
        }),
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    await deliveriesRepo
      .createQueryBuilder()
      .update(MilkDelivery)
      .set({ assignedUserId: params.assigneeUserId })
      .where('subscription_id = :subId', { subId: saved.id })
      .andWhere('delivery_date = :today', { today })
      .andWhere('status IN (:...statuses)', {
        statuses: [DeliveryStatus.PENDING, DeliveryStatus.OUT_FOR_DELIVERY],
      })
      .execute();

    await manager.getRepository(ChangeLog).save(
      manager.getRepository(ChangeLog).create({
        supplierId: saved.supplierId,
        entityType: 'SUBSCRIPTION',
        entityId: saved.id,
        changeType: 'UPDATE',
        entityVersion: saved.version,
      }),
    );

    return saved;
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

  private async resolveFarmId(sub: MilkSubscription): Promise<string> {
    if (sub.farmId) return sub.farmId;
    const farms = await this.farmsRepo.find({
      where: { createdByUserId: sub.supplierId },
      order: { createdAt: 'ASC' },
      take: 1,
    });
    const farm = farms[0];
    if (!farm) {
      throw new NotFoundException('Farm not found for this subscription');
    }
    return farm.id;
  }

  private async assertActiveDeliveryStaff(farmId: string, userId: string) {
    const member = await this.membersRepo.findOne({
      where: {
        farmId,
        userId,
        memberRole: FarmMemberRole.DELIVERY_STAFF,
        status: FarmMemberStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new BadRequestException(
        'Assignee must be an active delivery staff member of this farm',
      );
    }
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

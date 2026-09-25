import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DeliveryStatus,
  FarmMemberRole,
  FarmMemberStatus,
  UserRole,
} from '../../common/enums';
import { todayIso } from '../../common/utils/date.util';
import { roundMoney } from '../../common/utils/decimal.util';
import { assertFound } from '../../common/utils/ownership.util';
import { DeliveryEditHistory } from '../deliveries/entities/delivery-edit-history.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { aggregateFarmTodayMetrics } from '../deliveries/utils/farm-today-metrics.util';
import { Payment } from '../payments/entities/payment.entity';
import { FarmMilkProduct } from './entities/farm-milk-product.entity';
import { FarmMember } from './entities/farm-member.entity';
import { FarmsService } from './farms.service';

@Injectable()
export class FarmStaffDetailService {
  constructor(
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(DeliveryEditHistory)
    private readonly editHistoryRepo: Repository<DeliveryEditHistory>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
    private readonly farmsService: FarmsService,
  ) {}

  async getStaffDetail(
    user: { id: string; role: UserRole },
    farmId: string,
    staffUserId: string,
  ) {
    const member = await this.requireStaffMember(user, farmId, staffUserId);
    const today = todayIso();
    const todayRows = await this.deliveriesForStaff(farmId, staffUserId, today);
    const metrics = aggregateFarmTodayMetrics(todayRows);
    const cashCollected = await this.cashCollectedToday(
      farmId,
      staffUserId,
      today,
    );
    const lifetimeDelivered = await this.deliveriesRepo.count({
      where: {
        farmId,
        deliveredByUserId: staffUserId,
        status: DeliveryStatus.DELIVERED,
      },
    });
    const editStats = await this.editStats(staffUserId, farmId);

    return {
      member,
      profile: {
        id: member.user.id,
        name: member.user.name,
        mobileNumber: member.user.mobileNumber,
        email: member.user.email,
        status: member.status,
        memberRole: member.memberRole,
        joinedAt: member.joinedAt,
        farmId,
      },
      today: {
        ...metrics,
        assignedCustomers: metrics.totalCount,
        cashCollected,
      },
      lifetimeDeliveryCount: lifetimeDelivered,
      editStats,
    };
  }

  async getStaffToday(
    user: { id: string; role: UserRole },
    farmId: string,
    staffUserId: string,
    section?: 'all' | 'pending' | 'extra' | 'edited',
  ) {
    await this.requireStaffMember(user, farmId, staffUserId);
    const today = todayIso();
    let rows = await this.deliveriesForStaff(farmId, staffUserId, today);
    if (section === 'pending') {
      rows = rows.filter(
        (r) =>
          r.status === DeliveryStatus.PENDING ||
          r.status === DeliveryStatus.OUT_FOR_DELIVERY,
      );
    } else if (section === 'extra') {
      rows = rows.filter(
        (r) =>
          Number(r.customerExtraQuantity) > 0 ||
          Number(r.staffExtraQuantity) > 0,
      );
    } else if (section === 'edited') {
      rows = rows.filter((r) => r.isEdited);
    }

    const productIds = [
      ...new Set(rows.map((r) => r.farmProductId).filter(Boolean)),
    ] as string[];
    const products =
      productIds.length > 0
        ? await this.productsRepo.find({ where: { id: In(productIds) } })
        : [];
    const productName = new Map(
      products.map((p) => [p.id, String(p.milkType || 'Milk')]),
    );

    const metrics = aggregateFarmTodayMetrics(
      await this.deliveriesForStaff(farmId, staffUserId, today),
    );

    return {
      date: today,
      summary: metrics,
      totalExtraDelivered: metrics.totalExtraQuantity,
      deliveries: rows.map((d) => ({
        id: d.id,
        customerId: d.customerId,
        customerName: d.customer?.name ?? null,
        mobileNumber: d.customer?.mobileNumber ?? null,
        address: d.customer?.address ?? null,
        productName: d.farmProductId
          ? (productName.get(d.farmProductId) ?? null)
          : null,
        scheduledQuantity: d.scheduledQuantity,
        customerExtraQuantity: d.customerExtraQuantity,
        staffExtraQuantity: d.staffExtraQuantity,
        extraQuantity: (
          Number(d.customerExtraQuantity) + Number(d.staffExtraQuantity)
        ).toFixed(3),
        finalDeliveredQuantity: d.finalDeliveredQuantity,
        status: d.status,
        deliveredAt: d.deliveredAt,
        isEdited: d.isEdited,
        editReviewStatus: d.editReviewStatus,
        latitude: null as string | null,
        longitude: null as string | null,
      })),
    };
  }

  async listStaffDeliveries(
    user: { id: string; role: UserRole },
    farmId: string,
    staffUserId: string,
    opts?: { from?: string; to?: string },
  ) {
    await this.requireStaffMember(user, farmId, staffUserId);
    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'customer')
      .where('d.farm_id = :farmId', { farmId })
      .andWhere(
        '(d.assigned_user_id = :staffUserId OR d.delivered_by_user_id = :staffUserId)',
        { staffUserId },
      )
      .orderBy('d.delivery_date', 'DESC')
      .addOrderBy('d.delivered_at', 'DESC')
      .take(100);
    if (opts?.from) {
      qb.andWhere('d.delivery_date >= :from', { from: opts.from });
    }
    if (opts?.to) {
      qb.andWhere('d.delivery_date <= :to', { to: opts.to });
    }
    return qb.getMany();
  }

  async listEditedDeliveries(
    user: { id: string; role: UserRole },
    farmId: string,
    staffUserId: string,
  ) {
    await this.requireStaffMember(user, farmId, staffUserId);
    const history = await this.editHistoryRepo
      .createQueryBuilder('h')
      .innerJoinAndSelect('h.delivery', 'd')
      .leftJoinAndSelect('d.customer', 'customer')
      .where('h.edited_by_user_id = :staffUserId', { staffUserId })
      .andWhere('d.farm_id = :farmId', { farmId })
      .orderBy('h.edited_at', 'DESC')
      .take(100)
      .getMany();
    return {
      stats: await this.editStats(staffUserId, farmId),
      items: history,
    };
  }

  async deactivateWithPendingCheck(
    user: { id: string; role: UserRole },
    farmId: string,
    memberId: string,
    opts?: { force?: boolean },
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const member = assertFound(
      await this.membersRepo.findOne({
        where: { id: memberId, farmId },
        relations: ['user'],
      }),
      'Farm member not found',
    );
    if (member.memberRole === FarmMemberRole.OWNER) {
      throw new BadRequestException('Cannot change status of the farm owner');
    }

    const today = todayIso();
    const pending = await this.deliveriesRepo.count({
      where: [
        {
          farmId,
          assignedUserId: member.userId,
          deliveryDate: today,
          status: DeliveryStatus.PENDING,
        },
        {
          farmId,
          assignedUserId: member.userId,
          deliveryDate: today,
          status: DeliveryStatus.OUT_FOR_DELIVERY,
        },
      ],
    });

    if (pending > 0 && !opts?.force) {
      throw new ConflictException({
        code: 'PENDING_DELIVERIES',
        message: `This staff member has ${pending} pending deliveries today.`,
        pendingCount: pending,
        actions: ['REASSIGN_DELIVERIES', 'CANCEL'],
      });
    }

    member.status = FarmMemberStatus.INACTIVE;
    return this.membersRepo.save(member);
  }

  private async requireStaffMember(
    user: { id: string; role: UserRole },
    farmId: string,
    staffUserId: string,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    return assertFound(
      await this.membersRepo.findOne({
        where: { farmId, userId: staffUserId },
        relations: ['user'],
      }),
      'Staff member not found',
    );
  }

  private async deliveriesForStaff(
    farmId: string,
    staffUserId: string,
    date: string,
  ) {
    return this.deliveriesRepo.find({
      where: { farmId, assignedUserId: staffUserId, deliveryDate: date },
      relations: ['customer'],
      order: { deliveredAt: 'ASC', createdAt: 'ASC' },
    });
  }

  private async cashCollectedToday(
    farmId: string,
    staffUserId: string,
    today: string,
  ) {
    const rows = await this.paymentsRepo.find({
      where: {
        farmId,
        recordedByUserId: staffUserId,
        paymentDate: today,
      },
    });
    return roundMoney(
      rows.reduce((a, p) => a + Number(p.amount), 0).toString(),
    );
  }

  private async editStats(staffUserId: string, farmId: string) {
    const today = todayIso();
    const weekStart = this.addDays(today, -6);
    const monthStart = `${today.slice(0, 7)}-01`;

    const [editedToday, editedThisWeek, editedThisMonth] = await Promise.all([
      this.countEdits(staffUserId, farmId, today, today),
      this.countEdits(staffUserId, farmId, weekStart, today),
      this.countEdits(staffUserId, farmId, monthStart, today),
    ]);

    return { editedToday, editedThisWeek, editedThisMonth };
  }

  private async countEdits(
    staffUserId: string,
    farmId: string,
    from: string,
    to: string,
  ) {
    return this.editHistoryRepo
      .createQueryBuilder('h')
      .innerJoin('h.delivery', 'd')
      .where('h.edited_by_user_id = :staffUserId', { staffUserId })
      .andWhere('d.farm_id = :farmId', { farmId })
      .andWhere('h.edited_at::date BETWEEN :from AND :to', { from, to })
      .getCount();
  }

  private addDays(isoDate: string, delta: number): string {
    const [y, m, day] = isoDate.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, day));
    d.setUTCDate(d.getUTCDate() + delta);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
}

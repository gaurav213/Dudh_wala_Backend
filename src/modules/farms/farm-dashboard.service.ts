import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import {
  ConnectionStatus,
  DeliveryStatus,
  FarmMemberRole,
  FarmMemberStatus,
  FarmStatus,
  InvitationStatus,
  PaymentStatus,
  ServiceAreaStatus,
  ServiceRequestStatus,
} from '../../common/enums';
import { FarmCustomerConnection } from '../connections/entities/farm-customer-connection.entity';
import { FarmCustomerInvitation } from '../customer-invitations/entities/farm-customer-invitation.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { Payment } from '../payments/entities/payment.entity';
import { CustomerServiceRequest } from '../service-requests/entities/customer-service-request.entity';
import { FarmMemberInvitation } from './entities/farm-member-invitation.entity';
import { FarmMember } from './entities/farm-member.entity';
import { FarmMilkProduct } from './entities/farm-milk-product.entity';
import { FarmServiceArea } from './entities/farm-service-area.entity';
import { Farm } from './entities/farm.entity';
import { splitFarmBillRemainings } from './utils/farm-bill-remainings.util';
import {
  startOfMonthIso,
  startOfWeekIso,
  todayInTz,
} from './utils/farm-money-dates.util';

function isIsoDate(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveRange(from?: string, to?: string, date?: string): {
  fromDate: string;
  toDate: string;
} {
  // Legacy single-day `date` still works.
  if (isIsoDate(date) && !from && !to) {
    return { fromDate: date, toDate: date };
  }
  const today = todayInTz();
  let fromDate = isIsoDate(from) ? from : today;
  let toDate = isIsoDate(to) ? to : fromDate;
  if (fromDate > toDate) {
    const swap = fromDate;
    fromDate = toDate;
    toDate = swap;
  }
  return { fromDate, toDate };
}

@Injectable()
export class FarmDashboardService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    @InjectRepository(FarmServiceArea)
    private readonly areasRepo: Repository<FarmServiceArea>,
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
    @InjectRepository(FarmCustomerConnection)
    private readonly connectionsRepo: Repository<FarmCustomerConnection>,
    @InjectRepository(CustomerServiceRequest)
    private readonly serviceRequestsRepo: Repository<CustomerServiceRequest>,
    @InjectRepository(FarmCustomerInvitation)
    private readonly customerInvitationsRepo: Repository<FarmCustomerInvitation>,
    @InjectRepository(FarmMemberInvitation)
    private readonly memberInvitationsRepo: Repository<FarmMemberInvitation>,
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
  ) {}

  private async sumDeliveredAmount(
    ownerId: string,
    fromDate: string,
    toDate: string,
  ): Promise<string> {
    const row = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.amount), 0)', 'total')
      .where('d.supplier_id = :ownerId', { ownerId })
      .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .andWhere('d.delivery_date >= :fromDate', { fromDate })
      .andWhere('d.delivery_date <= :toDate', { toDate })
      .getRawOne<{ total: string }>();
    return String(row?.total ?? '0');
  }

  private async sumCollectedAmount(
    ownerId: string,
    fromDate: string,
    toDate: string,
  ): Promise<string> {
    const row = await this.paymentsRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.supplier_id = :ownerId', { ownerId })
      .andWhere('p.status = :status', { status: PaymentStatus.CONFIRMED })
      .andWhere('p.payment_date >= :fromDate', { fromDate })
      .andWhere('p.payment_date <= :toDate', { toDate })
      .getRawOne<{ total: string }>();
    return String(row?.total ?? '0');
  }

  /**
   * Live till-date receivables: per customer (milk delivered − confirmed cash),
   * then sum dues and advances separately so one advance never hides another's due.
   */
  private async liveCustomerReceivables(ownerId: string): Promise<{
    toCollect: string;
    advanceBalance: string;
  }> {
    const [milkRows, payRows] = await Promise.all([
      this.deliveriesRepo
        .createQueryBuilder('d')
        .select('d.customer_id', 'customerId')
        .addSelect('COALESCE(SUM(d.amount), 0)', 'total')
        .where('d.supplier_id = :ownerId', { ownerId })
        .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
        .andWhere('d.confirmation_status NOT IN (:...excluded)', {
          excluded: ['CUSTOMER_REPORTED_NOT_RECEIVED', 'DISPUTED'],
        })
        .groupBy('d.customer_id')
        .getRawMany<{ customerId: string; total: string }>(),
      this.paymentsRepo
        .createQueryBuilder('p')
        .select('p.customer_id', 'customerId')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.supplier_id = :ownerId', { ownerId })
        .andWhere('p.status = :status', { status: PaymentStatus.CONFIRMED })
        .groupBy('p.customer_id')
        .getRawMany<{ customerId: string; total: string }>(),
    ]);

    const milk = new Map(milkRows.map((r) => [r.customerId, r.total]));
    const pay = new Map(payRows.map((r) => [r.customerId, r.total]));
    const nets: string[] = [];
    for (const id of new Set([...milk.keys(), ...pay.keys()])) {
      nets.push(
        new Decimal(milk.get(id) ?? 0).minus(pay.get(id) ?? 0).toFixed(2),
      );
    }
    return splitFarmBillRemainings(nets);
  }

  async myDashboard(
    user: { id: string },
    opts?: { date?: string; from?: string; to?: string },
  ) {
    const membership = await this.membersRepo.findOne({
      where: {
        userId: user.id,
        memberRole: FarmMemberRole.OWNER,
        status: FarmMemberStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });
    if (!membership) {
      throw new NotFoundException('No farm found for this owner');
    }
    const farm = await this.farmsRepo.findOneOrFail({
      where: { id: membership.farmId },
    });

    const { fromDate, toDate } = resolveRange(opts?.from, opts?.to, opts?.date);
    const singleDay = fromDate === toDate;
    const weekStart = startOfWeekIso(toDate);
    const monthStart = startOfMonthIso(toDate);
    const ownerId = farm.createdByUserId;

    const [
      staffCount,
      areaCount,
      activeAreaCount,
      productCount,
      availableProductCount,
      connectionCount,
      pendingServiceRequests,
      pendingCustomerInvitations,
      pendingMemberInvitations,
      todayDeliveries,
      outstanding,
      madeInRange,
      madeThisWeek,
      madeThisMonth,
      collectedInRange,
      collectedThisWeek,
      collectedThisMonth,
    ] = await Promise.all([
      this.membersRepo.count({
        where: {
          farmId: farm.id,
          memberRole: FarmMemberRole.DELIVERY_STAFF,
          status: FarmMemberStatus.ACTIVE,
        },
      }),
      this.areasRepo.count({ where: { farmId: farm.id } }),
      this.areasRepo.count({
        where: { farmId: farm.id, status: ServiceAreaStatus.ACTIVE },
      }),
      this.productsRepo.count({ where: { farmId: farm.id } }),
      this.productsRepo.count({
        where: { farmId: farm.id, isAvailable: true },
      }),
      this.connectionsRepo.count({
        where: { farmId: farm.id, status: ConnectionStatus.ACTIVE },
      }),
      this.serviceRequestsRepo.count({
        where: { farmId: farm.id, status: ServiceRequestStatus.PENDING },
      }),
      this.customerInvitationsRepo.count({
        where: { farmId: farm.id, status: InvitationStatus.PENDING },
      }),
      this.memberInvitationsRepo.count({
        where: { farmId: farm.id, status: InvitationStatus.PENDING },
      }),
      this.deliveriesRepo.count({
        where: { supplierId: ownerId, deliveryDate: toDate },
      }),
      this.liveCustomerReceivables(ownerId),
      this.sumDeliveredAmount(ownerId, fromDate, toDate),
      singleDay
        ? this.sumDeliveredAmount(ownerId, weekStart, toDate)
        : Promise.resolve('0'),
      singleDay
        ? this.sumDeliveredAmount(ownerId, monthStart, toDate)
        : Promise.resolve('0'),
      this.sumCollectedAmount(ownerId, fromDate, toDate),
      singleDay
        ? this.sumCollectedAmount(ownerId, weekStart, toDate)
        : Promise.resolve('0'),
      singleDay
        ? this.sumCollectedAmount(ownerId, monthStart, toDate)
        : Promise.resolve('0'),
    ]);

    const toCollect = String(outstanding?.toCollect ?? '0');
    const advanceBalance = String(outstanding?.advanceBalance ?? '0');
    const profileComplete = Boolean(
      farm.businessName && farm.description && farm.email,
    );
    const filledFields = [
      farm.businessName,
      farm.description,
      farm.email,
      farm.latitude,
      farm.longitude,
    ].filter(Boolean).length;
    const profileCompletionPercent = Math.round((filledFields / 5) * 100);

    return {
      farm: {
        id: farm.id,
        name: farm.name,
        status: farm.status,
        createdAt: farm.createdAt,
      },
      profileCompletionPercent,
      counts: {
        serviceAreas: areaCount,
        activeServiceAreas: activeAreaCount,
        products: productCount,
        availableProducts: availableProductCount,
        staff: staffCount,
        connections: connectionCount,
        pendingServiceRequests,
        pendingCustomerInvitations,
        pendingMemberInvitations,
        todayDeliveries,
        outstandingBalance: toCollect,
        advanceBalance,
      },
      money: {
        fromDate,
        toDate,
        asOfDate: toDate,
        madeInRange,
        collectedInRange,
        // Keep old keys for single-day UI (day = range when from===to).
        madeToday: madeInRange,
        madeThisWeek,
        madeThisMonth,
        collectedToday: collectedInRange,
        collectedThisWeek,
        collectedThisMonth,
        toCollect,
        advanceBalance,
      },
      onboardingChecklist: {
        isApproved: farm.status === FarmStatus.ACTIVE,
        hasServiceArea: activeAreaCount > 0,
        hasProduct: availableProductCount > 0,
        hasStaff: staffCount > 0,
        profileComplete,
      },
    };
  }
}

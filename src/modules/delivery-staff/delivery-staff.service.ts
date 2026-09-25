import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { In, Repository } from 'typeorm';
import {
  DeliveryAssignmentStatus,
  DeliveryStatus,
  ExtraRequestStatus,
  FarmMemberStatus,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import { todayIso } from '../../common/utils/date.util';
import { roundMoney, roundQty, splitLedgerBalance } from '../../common/utils/decimal.util';
import {
  formatDistanceLabel,
  haversineDistanceMeters,
  parseCoordinate,
  sortStopsNearestFirst,
} from '../../common/utils/geo-distance.util';
import { assertFound } from '../../common/utils/ownership.util';
import { isDeliveryRequiredOnDate } from '../../common/utils/subscription-schedule.util';
import { CustomerAddress } from '../customer-addresses/entities/customer-address.entity';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { DeliveryExtraRequest } from '../deliveries/entities/delivery-extra-request.entity';
import { expectedQuantity } from '../deliveries/utils/delivery-quantity.util';
import { UpdateFarmDeliverySettingsDto } from '../farms/dto/farm-delivery-settings.dto';
import { DeliveryAssignment } from '../farms/entities/delivery-assignment.entity';
import { FarmDeliverySettings } from '../farms/entities/farm-delivery-settings.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { Farm } from '../farms/entities/farm.entity';
import { Payment } from '../payments/entities/payment.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { NotificationRecipient } from '../notifications/entities/notification-recipient.entity';

@Injectable()
export class DeliveryStaffService {
  constructor(
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(MilkSubscription)
    private readonly subsRepo: Repository<MilkSubscription>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(CustomerAddress)
    private readonly addressesRepo: Repository<CustomerAddress>,
    @InjectRepository(DeliveryAssignment)
    private readonly assignmentsRepo: Repository<DeliveryAssignment>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(FarmDeliverySettings)
    private readonly settingsRepo: Repository<FarmDeliverySettings>,
    @InjectRepository(DeliveryExtraRequest)
    private readonly extrasRepo: Repository<DeliveryExtraRequest>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(NotificationRecipient)
    private readonly notifRecipientsRepo: Repository<NotificationRecipient>,
  ) {}

  private todayIso() {
    return todayIso();
  }

  async assertStaffOrOwner(user: { id: string; role: UserRole }) {
    if (
      user.role !== UserRole.DELIVERY_STAFF &&
      user.role !== UserRole.FARM_OWNER &&
      user.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException('Delivery staff or farm owner required');
    }
  }

  async pendingCash(user: { id: string; role: UserRole }) {
    await this.assertStaffOrOwner(user);

    if (user.role === UserRole.DELIVERY_STAFF) {
      const farmIds = await this.myFarmIds(user.id);
      const assignedCustomerIds = (
        await this.subsRepo.find({
          where: {
            assignedDeliveryUserId: user.id,
            status: SubscriptionStatus.ACTIVE,
          },
          select: ['customerId'],
        })
      ).map((s) => s.customerId);

      const qb = this.paymentsRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.customer', 'c')
        .where('p.status = :status', {
          status: PaymentStatus.PENDING_CONFIRMATION,
        })
        .orderBy('p.created_at', 'DESC');

      if (farmIds.length && assignedCustomerIds.length) {
        qb.andWhere(
          '(p.farm_id IN (:...farmIds) OR p.customer_id IN (:...customerIds))',
          { farmIds, customerIds: assignedCustomerIds },
        );
      } else if (farmIds.length) {
        qb.andWhere('p.farm_id IN (:...farmIds)', { farmIds });
      } else if (assignedCustomerIds.length) {
        qb.andWhere('p.customer_id IN (:...customerIds)', {
          customerIds: assignedCustomerIds,
        });
      } else {
        return [];
      }
      return qb.getMany();
    }

    if (user.role === UserRole.FARM_OWNER) {
      return this.paymentsRepo.find({
        where: {
          supplierId: user.id,
          status: PaymentStatus.PENDING_CONFIRMATION,
        },
        relations: ['customer'],
        order: { createdAt: 'DESC' },
      });
    }

    return this.paymentsRepo.find({
      where: { status: PaymentStatus.PENDING_CONFIRMATION },
      relations: ['customer'],
      order: { createdAt: 'DESC' },
    });
  }

  async myFarmIds(userId: string): Promise<string[]> {
    const members = await this.membersRepo.find({
      where: { userId, status: FarmMemberStatus.ACTIVE },
    });
    return members.map((m) => m.farmId);
  }

  async dashboard(user: { id: string; role: UserRole }) {
    await this.assertStaffOrOwner(user);
    const date = this.todayIso();
    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .where('d.delivery_date = :date', { date });

    if (user.role === UserRole.DELIVERY_STAFF) {
      qb.andWhere(
        '(d.assigned_user_id = :uid OR d.subscription_id IN ' +
          '(SELECT s.id FROM milk_subscriptions s WHERE s.assigned_delivery_user_id = :uid))',
        { uid: user.id },
      );
    } else if (user.role === UserRole.FARM_OWNER) {
      qb.andWhere('d.supplier_id = :uid', { uid: user.id });
    }

    const deliveries = await qb.getMany();
    const count = (status: DeliveryStatus) =>
      deliveries.filter((d) => d.status === status).length;

    const planned = deliveries.reduce(
      (acc, d) =>
        acc.plus(
          expectedQuantity({
            scheduledQuantity: d.scheduledQuantity,
            customerExtraQuantity: d.customerExtraQuantity,
            staffExtraQuantity: d.staffExtraQuantity,
          }),
        ),
      new Decimal(0),
    );
    const delivered = deliveries
      .filter((d) => d.status === DeliveryStatus.DELIVERED)
      .reduce(
        (acc, d) => acc.plus(d.finalDeliveredQuantity || d.quantity || 0),
        new Decimal(0),
      );

    const cashToCollect = deliveries
      .filter((d) => d.status === DeliveryStatus.DELIVERED)
      .reduce((acc, d) => acc.plus(d.amount || 0), new Decimal(0));

    const extras = await this.extrasRepo.count({
      where: {
        deliveryDate: date,
        status: ExtraRequestStatus.PENDING,
        ...(user.role === UserRole.DELIVERY_STAFF
          ? {}
          : user.role === UserRole.FARM_OWNER
            ? {}
            : {}),
      },
    });

    const paymentsToday = await this.paymentsRepo
      .createQueryBuilder('p')
      .where('p.payment_date = :date', { date })
      .andWhere('p.recorded_by_user_id = :uid', { uid: user.id })
      .getMany();
    const paymentsCollected = paymentsToday.reduce(
      (acc, p) => acc.plus(p.amount || 0),
      new Decimal(0),
    );

    const recentNotifs = await this.notifRecipientsRepo.find({
      where: { userId: user.id },
      relations: ['notification'],
      order: { createdAt: 'DESC' },
      take: 5,
    });

    const permissions = await this.effectivePermissions(user);

    return {
      date,
      todaysCustomers: new Set(deliveries.map((d) => d.customerId)).size,
      pending: count(DeliveryStatus.PENDING),
      outForDelivery: count(DeliveryStatus.OUT_FOR_DELIVERY),
      delivered: count(DeliveryStatus.DELIVERED),
      skipped: count(DeliveryStatus.SKIPPED),
      failed: count(DeliveryStatus.FAILED),
      disputed: count(DeliveryStatus.DISPUTED),
      extraRequests: extras,
      plannedLitres: roundQty(planned.toString()),
      deliveredLitres: roundQty(delivered.toString()),
      cashToCollect: roundMoney(cashToCollect.toString()),
      paymentsCollectedToday: roundMoney(paymentsCollected.toString()),
      permissions,
      recentNotifications: recentNotifs.map((r) => ({
        recipientId: r.id,
        readAt: r.readAt,
        notification: r.notification,
      })),
    };
  }

  async customers(user: { id: string; role: UserRole }) {
    await this.assertStaffOrOwner(user);
    const date = this.todayIso();

    let subs: MilkSubscription[];
    if (user.role === UserRole.DELIVERY_STAFF) {
      const assignedSubIds = (
        await this.assignmentsRepo.find({
          where: {
            assigneeUserId: user.id,
            status: DeliveryAssignmentStatus.ACTIVE,
          },
        })
      )
        .map((a) => a.subscriptionId)
        .filter((id): id is string => Boolean(id));

      subs = await this.subsRepo.find({
        where: [
          { assignedDeliveryUserId: user.id },
          ...(assignedSubIds.length ? [{ id: In(assignedSubIds) } as any] : []),
        ],
      });
      // Dedupe
      const byId = new Map(subs.map((s) => [s.id, s]));
      subs = [...byId.values()];
    } else {
      subs = await this.subsRepo.find({
        where: { supplierId: user.id },
      });
    }

    const customerIds = [...new Set(subs.map((s) => s.customerId))];
    const customers = customerIds.length
      ? await this.customersRepo.find({ where: { id: In(customerIds) } })
      : [];
    const customerById = new Map(customers.map((c) => [c.id, c]));

    const deliveries = customerIds.length
      ? await this.deliveriesRepo.find({
          where: { customerId: In(customerIds), deliveryDate: date },
        })
      : [];

    const farmIds = [
      ...new Set(
        subs.map((s) => s.farmId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const settingsByFarm = new Map<string, FarmDeliverySettings>();
    for (const farmId of farmIds) {
      settingsByFarm.set(farmId, await this.getOrCreateSettings(farmId));
    }

    const balances = await this.balancesForCustomers(
      customerIds,
      subs,
      settingsByFarm,
    );

    return subs.map((sub) => {
      const customer = customerById.get(sub.customerId);
      const todayDelivery = deliveries.find(
        (d) =>
          d.subscriptionId === sub.id && d.deliveryShift === sub.deliveryShift,
      );
      const scheduledToday = isDeliveryRequiredOnDate(sub, date);
      const customerExtra = todayDelivery?.customerExtraQuantity ?? '0';
      const staffExtra = todayDelivery?.staffExtraQuantity ?? '0';
      const regular = sub.defaultQuantity;
      const todayTotal = todayDelivery
        ? expectedQuantity({
            scheduledQuantity: todayDelivery.scheduledQuantity,
            customerExtraQuantity: todayDelivery.customerExtraQuantity,
            staffExtraQuantity: todayDelivery.staffExtraQuantity,
          })
        : scheduledToday
          ? regular
          : '0';
      const farmSettings = sub.farmId ? settingsByFarm.get(sub.farmId) : null;
      const canViewBalance = farmSettings?.canViewCustomerBalance !== false;

      return {
        customerId: sub.customerId,
        customerUserId: customer?.customerUserId ?? null,
        name: customer?.name ?? 'Customer',
        mobileNumber: customer?.mobileNumber ?? null,
        addressSummary: customer?.address ?? null,
        milkType: sub.milkType,
        regularQuantity: regular,
        deliveryShift: sub.deliveryShift,
        subscriptionStatus: sub.status,
        subscriptionId: sub.id,
        farmId: sub.farmId,
        scheduledToday,
        extraQuantityRequested: customerExtra,
        staffExtraQuantity: staffExtra,
        todayTotalQuantity: todayTotal,
        todayStatus:
          todayDelivery?.status ?? (scheduledToday ? 'PENDING' : 'NONE'),
        deliveryId: todayDelivery?.id ?? null,
        balance: canViewBalance
          ? (balances.get(sub.customerId) ?? '0.00')
          : null,
        canViewCustomerBalance: canViewBalance,
      };
    });
  }

  async customerDetail(
    user: { id: string; role: UserRole },
    customerId: string,
  ) {
    await this.assertStaffOrOwner(user);
    const customer = assertFound(
      await this.customersRepo.findOne({ where: { id: customerId } }),
      'Customer not found',
    );

    if (user.role === UserRole.DELIVERY_STAFF) {
      const allowed = await this.customers(user);
      if (!allowed.some((c) => c.customerId === customerId)) {
        throw new ForbiddenException('Customer not assigned to you');
      }
    } else if (
      user.role === UserRole.FARM_OWNER &&
      customer.supplierId !== user.id
    ) {
      throw new ForbiddenException();
    }

    const date = this.todayIso();
    const subs = await this.subsRepo.find({ where: { customerId } });
    const deliveries = await this.deliveriesRepo.find({
      where: { customerId, deliveryDate: date },
    });

    const farmId =
      subs.find((s) => s.farmId)?.farmId ??
      (
        await this.farmsRepo.findOne({
          where: { createdByUserId: customer.supplierId },
        })
      )?.id;

    const settings = farmId ? await this.getOrCreateSettings(farmId) : null;

    const billing =
      settings?.canViewBillingSummary !== false
        ? await this.billingSummary(user, customerId, farmId ?? undefined)
        : null;

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        mobileNumber: customer.mobileNumber,
        address: customer.address,
        notes: customer.notes,
        customerUserId: customer.customerUserId,
      },
      permissions: settings,
      today: deliveries.map((d) => ({
        ...d,
        expectedQuantity: expectedQuantity({
          scheduledQuantity: d.scheduledQuantity,
          customerExtraQuantity: d.customerExtraQuantity,
          staffExtraQuantity: d.staffExtraQuantity,
        }),
      })),
      subscriptions: subs,
      billing,
    };
  }

  async billingSummary(
    user: { id: string; role: UserRole },
    customerId: string,
    farmId?: string,
  ) {
    const customer = assertFound(
      await this.customersRepo.findOne({ where: { id: customerId } }),
      'Customer not found',
    );

    if (user.role === UserRole.DELIVERY_STAFF) {
      const farmIds = await this.myFarmIds(user.id);
      const fid = farmId ?? farmIds[0];
      if (fid) {
        const settings = await this.getOrCreateSettings(fid);
        if (!settings.canViewBillingSummary) {
          throw new ForbiddenException('Billing summary not permitted');
        }
      }
    } else if (
      user.role === UserRole.FARM_OWNER &&
      customer.supplierId !== user.id
    ) {
      throw new ForbiddenException();
    }

    const today = this.todayIso();
    const monthStart = `${today.slice(0, 7)}-01`;

    const monthDeliveries = await this.deliveriesRepo
      .createQueryBuilder('d')
      .where('d.customer_id = :customerId', { customerId })
      .andWhere('d.delivery_date >= :monthStart', { monthStart })
      .andWhere('d.delivery_date <= :today', { today })
      .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .andWhere('d.confirmation_status NOT IN (:...excluded)', {
        excluded: ['CUSTOMER_REPORTED_NOT_RECEIVED', 'DISPUTED'],
      })
      .getMany();

    // Also exclude disputed status rows
    const billable = monthDeliveries.filter(
      (d) => d.status !== DeliveryStatus.DISPUTED,
    );

    const todayDelivery = billable.find((d) => d.deliveryDate === today);
    const todaysAmount = todayDelivery?.amount ?? '0.00';

    const regular = billable.reduce(
      (acc, d) => acc.plus(d.scheduledQuantity || 0),
      new Decimal(0),
    );
    const extra = billable.reduce(
      (acc, d) =>
        acc.plus(d.customerExtraQuantity || 0).plus(d.staffExtraQuantity || 0),
      new Decimal(0),
    );
    const totalQty = billable.reduce(
      (acc, d) => acc.plus(d.finalDeliveredQuantity || d.quantity || 0),
      new Decimal(0),
    );
    const milkCharges = billable.reduce(
      (acc, d) => acc.plus(d.amount || 0),
      new Decimal(0),
    );

    const payments = await this.paymentsRepo
      .createQueryBuilder('p')
      .where('p.customer_id = :customerId', { customerId })
      .andWhere('p.payment_date >= :monthStart', { monthStart })
      .andWhere('p.payment_date <= :today', { today })
      .getMany();
    const confirmed = payments.filter((p) => p.status === 'CONFIRMED');
    const pending = payments.filter((p) => p.status === 'PENDING_CONFIRMATION');
    const paymentsTotal = confirmed.reduce(
      (acc, p) => acc.plus(p.amount || 0),
      new Decimal(0),
    );
    const pendingTotal = pending.reduce(
      (acc, p) => acc.plus(p.amount || 0),
      new Decimal(0),
    );

    const previousBalance = new Decimal(0); // prior month carry — simplified
    const net = previousBalance.plus(milkCharges).minus(paymentsTotal);
    const ledger = splitLedgerBalance(net);

    return {
      todaysAmount: roundMoney(todaysAmount),
      monthDeliveredDays: new Set(billable.map((d) => d.deliveryDate)).size,
      monthRegularQuantity: roundQty(regular.toString()),
      monthExtraQuantity: roundQty(extra.toString()),
      monthTotalQuantity: roundQty(totalQty.toString()),
      monthMilkCharges: roundMoney(milkCharges.toString()),
      previousBalance: roundMoney(previousBalance.toString()),
      paymentsThisMonth: roundMoney(paymentsTotal.toString()),
      pendingCashThisMonth: roundMoney(pendingTotal.toString()),
      pendingCashClaims: pending.length,
      outstandingBalance: ledger.outstandingBalance,
      billTillToday: ledger.billTillToday,
      advanceBalance: ledger.advanceBalance,
    };
  }

  async myAssignments(user: { id: string; role: UserRole }) {
    await this.assertStaffOrOwner(user);
    if (user.role === UserRole.DELIVERY_STAFF) {
      return this.assignmentsRepo.find({
        where: {
          assigneeUserId: user.id,
          status: DeliveryAssignmentStatus.ACTIVE,
        },
        order: { createdAt: 'DESC' },
      });
    }
    return this.assignmentsRepo.find({
      where: { assignedByUserId: user.id },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /**
   * Today's route for the authenticated staff member.
   * When staff lat/lng are provided, stops are ordered nearest-first.
   * Deliveries without coordinates stay visible at the end of open stops.
   */
  async routeToday(
    user: { id: string; role: UserRole },
    query: {
      latitude?: string;
      longitude?: string;
      farmId?: string;
      shift?: string;
      includeCompleted?: string;
    },
  ) {
    await this.assertStaffOrOwner(user);
    const date = this.todayIso();
    const staffLat = parseCoordinate(query.latitude);
    const staffLng = parseCoordinate(query.longitude);
    const hasStaffLocation = staffLat != null && staffLng != null;

    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'c')
      .where('d.delivery_date = :date', { date });

    if (user.role === UserRole.DELIVERY_STAFF) {
      qb.andWhere(
        '(d.assigned_user_id = :uid OR d.subscription_id IN ' +
          '(SELECT s.id FROM milk_subscriptions s WHERE s.assigned_delivery_user_id = :uid))',
        { uid: user.id },
      );
    } else if (user.role === UserRole.FARM_OWNER) {
      qb.andWhere('d.supplier_id = :uid', { uid: user.id });
    }
    if (query.farmId) {
      qb.andWhere('d.farm_id = :farmId', { farmId: query.farmId });
    }
    if (query.shift) {
      qb.andWhere('d.delivery_shift = :shift', { shift: query.shift });
    }

    const includeCompleted = query.includeCompleted === 'true';
    if (!includeCompleted) {
      qb.andWhere('d.status IN (:...open)', {
        open: [DeliveryStatus.PENDING, DeliveryStatus.OUT_FOR_DELIVERY],
      });
    } else {
      qb.andWhere('d.status NOT IN (:...excluded)', {
        excluded: [DeliveryStatus.CANCELLED],
      });
    }

    const rows = await qb
      .orderBy('d.delivery_sequence', 'ASC', 'NULLS LAST')
      .addOrderBy('c.name', 'ASC')
      .getMany();

    const addressIds = [
      ...new Set(
        rows
          .map((d) => d.customerAddressId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const customerUserIds = [
      ...new Set(
        rows
          .map((d) => d.customerUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [byIdRows, defaultRows] = await Promise.all([
      addressIds.length
        ? this.addressesRepo.find({ where: { id: In(addressIds) } })
        : Promise.resolve([] as CustomerAddress[]),
      customerUserIds.length
        ? this.addressesRepo.find({
            where: { customerUserId: In(customerUserIds), isDefault: true },
          })
        : Promise.resolve([] as CustomerAddress[]),
    ]);
    const byId = new Map(byIdRows.map((a) => [a.id, a]));
    const defaultByUser = new Map(
      defaultRows.map((a) => [a.customerUserId, a]),
    );

    const stops = rows.map((d) => {
      const address =
        (d.customerAddressId ? byId.get(d.customerAddressId) : undefined) ??
        (d.customerUserId ? defaultByUser.get(d.customerUserId) : undefined);
      const lat = parseCoordinate(address?.latitude);
      const lng = parseCoordinate(address?.longitude);
      const locationAvailable = lat != null && lng != null;
      const distanceMeters =
        hasStaffLocation && locationAvailable
          ? Math.round(haversineDistanceMeters(staffLat, staffLng, lat, lng))
          : null;
      const totalExpectedQuantity = expectedQuantity({
        scheduledQuantity: d.scheduledQuantity,
        customerExtraQuantity: d.customerExtraQuantity,
        staffExtraQuantity: d.staffExtraQuantity,
      });

      return {
        deliveryId: d.id,
        customerId: d.customerId,
        customerUserId: d.customerUserId,
        customerName: d.customer?.name ?? 'Customer',
        customerProfilePicture: null as string | null,
        mobileNumber: d.customer?.mobileNumber ?? null,
        addressId: address?.id ?? null,
        address: address
          ? [
              address.addressLine1,
              address.addressLine2,
              address.area,
              address.city,
            ]
              .filter(Boolean)
              .join(', ')
          : (d.customer?.address ?? null),
        area: address?.area ?? null,
        latitude: address?.latitude ?? null,
        longitude: address?.longitude ?? null,
        locationVerified: address?.locationVerified ?? false,
        locationSource: address?.locationSource ?? null,
        scheduledQuantity: d.scheduledQuantity,
        customerExtraQuantity: d.customerExtraQuantity,
        staffExtraQuantity: d.staffExtraQuantity,
        totalExpectedQuantity,
        productName: null as string | null,
        deliveryShift: d.deliveryShift,
        status: d.status,
        deliverySequence: d.deliverySequence ?? null,
        distanceMeters,
        distanceLabel: formatDistanceLabel(distanceMeters),
        locationAvailable,
      };
    });

    const ordered = hasStaffLocation ? sortStopsNearestFirst(stops) : stops;

    const pending = ordered.filter(
      (s) =>
        s.status === DeliveryStatus.PENDING ||
        s.status === DeliveryStatus.OUT_FOR_DELIVERY,
    );
    const completed = ordered.filter(
      (s) => s.status === DeliveryStatus.DELIVERED,
    );
    const remainingLitres = pending.reduce(
      (acc, s) => acc.plus(s.totalExpectedQuantity || 0),
      new Decimal(0),
    );
    const totalDistanceMeters = pending
      .filter((s) => s.distanceMeters != null)
      .reduce((acc, s) => acc + (s.distanceMeters as number), 0);

    return {
      date,
      staffLocation: hasStaffLocation
        ? { latitude: staffLat, longitude: staffLng }
        : null,
      locationOrderingApplied: hasStaffLocation,
      pendingCount: pending.length,
      completedCount: completed.length,
      totalMilkRemaining: roundQty(remainingLitres.toString()),
      estimatedStraightLineMeters: hasStaffLocation
        ? totalDistanceMeters
        : null,
      estimatedStraightLineLabel: formatDistanceLabel(
        hasStaffLocation ? totalDistanceMeters : null,
      ),
      nextStop: pending[0] ?? null,
      stops: ordered.map((s, index) => ({ ...s, sequence: index + 1 })),
    };
  }

  async todayDeliveries(
    user: { id: string; role: UserRole },
    filters: { status?: DeliveryStatus; shift?: string } = {},
  ) {
    await this.assertStaffOrOwner(user);
    const date = this.todayIso();
    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'c')
      .where('d.delivery_date = :date', { date })
      .orderBy('d.delivery_sequence', 'ASC', 'NULLS LAST')
      .addOrderBy('c.name', 'ASC');

    if (user.role === UserRole.DELIVERY_STAFF) {
      qb.andWhere(
        '(d.assigned_user_id = :uid OR d.subscription_id IN ' +
          '(SELECT s.id FROM milk_subscriptions s WHERE s.assigned_delivery_user_id = :uid))',
        { uid: user.id },
      );
    } else if (user.role === UserRole.FARM_OWNER) {
      qb.andWhere('d.supplier_id = :uid', { uid: user.id });
    }
    if (filters.status) {
      qb.andWhere('d.status = :status', { status: filters.status });
    }
    if (filters.shift) {
      qb.andWhere('d.delivery_shift = :shift', { shift: filters.shift });
    }
    const rows = await qb.getMany();
    return rows.map((d) => ({
      ...d,
      expectedQuantity: expectedQuantity({
        scheduledQuantity: d.scheduledQuantity,
        customerExtraQuantity: d.customerExtraQuantity,
        staffExtraQuantity: d.staffExtraQuantity,
      }),
      customerName: d.customer?.name,
      mobileNumber: d.customer?.mobileNumber,
      address: d.customer?.address,
    }));
  }

  async getOrCreateSettings(farmId: string) {
    let settings = await this.settingsRepo.findOne({ where: { farmId } });
    if (!settings) {
      settings = await this.settingsRepo.save(
        this.settingsRepo.create({ farmId }),
      );
    }
    return settings;
  }

  async getDeliverySettings(
    user: { id: string; role: UserRole },
    farmId: string,
  ) {
    await this.assertCanManageFarmSettings(user, farmId);
    return this.getOrCreateSettings(farmId);
  }

  async updateDeliverySettings(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: UpdateFarmDeliverySettingsDto,
  ) {
    if (
      user.role !== UserRole.FARM_OWNER &&
      user.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException(
        'Only farm owner can update delivery settings',
      );
    }
    await this.assertCanManageFarmSettings(user, farmId);
    const settings = await this.getOrCreateSettings(farmId);
    if (dto.canViewCustomerBalance !== undefined) {
      settings.canViewCustomerBalance = dto.canViewCustomerBalance;
    }
    if (dto.canViewBillingSummary !== undefined) {
      settings.canViewBillingSummary = dto.canViewBillingSummary;
    }
    if (dto.canRecordCashPayment !== undefined) {
      settings.canRecordCashPayment = dto.canRecordCashPayment;
    }
    if (dto.canViewPaymentHistory !== undefined) {
      settings.canViewPaymentHistory = dto.canViewPaymentHistory;
    }
    if (dto.deliveryStaffCanApproveExtraRequests !== undefined) {
      settings.deliveryStaffCanApproveExtraRequests =
        dto.deliveryStaffCanApproveExtraRequests;
    }
    if (dto.autoGenerateDailyList !== undefined) {
      settings.autoGenerateDailyList = dto.autoGenerateDailyList;
    }
    return this.settingsRepo.save(settings);
  }

  private async assertCanManageFarmSettings(
    user: { id: string; role: UserRole },
    farmId: string,
  ) {
    if (user.role === UserRole.PLATFORM_OWNER) return;
    const farm = assertFound(
      await this.farmsRepo.findOne({ where: { id: farmId } }),
      'Farm not found',
    );
    if (user.role === UserRole.FARM_OWNER && farm.createdByUserId === user.id) {
      return;
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      const farmIds = await this.myFarmIds(user.id);
      if (farmIds.includes(farmId)) return;
    }
    throw new ForbiddenException();
  }

  private async effectivePermissions(user: { id: string; role: UserRole }) {
    if (
      user.role === UserRole.FARM_OWNER ||
      user.role === UserRole.PLATFORM_OWNER
    ) {
      return {
        canViewCustomerBalance: true,
        canViewBillingSummary: true,
        canRecordCashPayment: true,
        canViewPaymentHistory: true,
        deliveryStaffCanApproveExtraRequests: true,
      };
    }
    const farmIds = await this.myFarmIds(user.id);
    if (!farmIds.length) {
      return {
        canViewCustomerBalance: true,
        canViewBillingSummary: true,
        canRecordCashPayment: false,
        canViewPaymentHistory: false,
        deliveryStaffCanApproveExtraRequests: false,
      };
    }
    const settingsList = await Promise.all(
      farmIds.map((id) => this.getOrCreateSettings(id)),
    );
    return {
      canViewCustomerBalance: settingsList.some(
        (s) => s.canViewCustomerBalance,
      ),
      canViewBillingSummary: settingsList.some((s) => s.canViewBillingSummary),
      canRecordCashPayment: settingsList.some((s) => s.canRecordCashPayment),
      canViewPaymentHistory: settingsList.some((s) => s.canViewPaymentHistory),
      deliveryStaffCanApproveExtraRequests: settingsList.some(
        (s) => s.deliveryStaffCanApproveExtraRequests,
      ),
    };
  }

  private async balancesForCustomers(
    customerIds: string[],
    subs: MilkSubscription[],
    settingsByFarm: Map<string, FarmDeliverySettings>,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!customerIds.length) return result;

    const eligible = customerIds.filter((cid) => {
      const farmId = subs.find((s) => s.customerId === cid)?.farmId;
      if (!farmId) return true;
      return settingsByFarm.get(farmId)?.canViewCustomerBalance !== false;
    });
    if (!eligible.length) return result;

    const today = this.todayIso();
    const monthStart = `${today.slice(0, 7)}-01`;

    const monthDeliveries = await this.deliveriesRepo
      .createQueryBuilder('d')
      .where('d.customer_id IN (:...eligible)', { eligible })
      .andWhere('d.delivery_date >= :monthStart', { monthStart })
      .andWhere('d.delivery_date <= :today', { today })
      .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .getMany();

    const payments = await this.paymentsRepo
      .createQueryBuilder('p')
      .where('p.customer_id IN (:...eligible)', { eligible })
      .andWhere('p.payment_date >= :monthStart', { monthStart })
      .andWhere('p.payment_date <= :today', { today })
      .getMany();

    for (const cid of eligible) {
      const milk = monthDeliveries
        .filter(
          (d) =>
            d.customerId === cid &&
            d.status !== DeliveryStatus.DISPUTED &&
            d.confirmationStatus !== 'CUSTOMER_REPORTED_NOT_RECEIVED' &&
            d.confirmationStatus !== 'DISPUTED',
        )
        .reduce((acc, d) => acc.plus(d.amount || 0), new Decimal(0));
      const paid = payments
        .filter((p) => p.customerId === cid)
        .reduce((acc, p) => acc.plus(p.amount || 0), new Decimal(0));
      result.set(cid, roundMoney(milk.minus(paid).toString()));
    }
    return result;
  }
}

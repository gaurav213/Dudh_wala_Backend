import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  DeliveryAssignmentStatus,
  DeliveryConfirmationStatus,
  DeliveryEventType,
  DeliveryStatus,
  FarmMemberStatus,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import { todayIso } from '../../common/utils/date.util';
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
import { isDeliveryRequiredOnDate } from '../../common/utils/subscription-schedule.util';
import { AuditService } from '../audit/audit.service';
import { CustomerAddress } from '../customer-addresses/entities/customer-address.entity';
import { Customer } from '../customers/entities/customer.entity';
import { DeliveryAssignment } from '../farms/entities/delivery-assignment.entity';
import { FarmDeliverySettings } from '../farms/entities/farm-delivery-settings.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { Farm } from '../farms/entities/farm.entity';
import { FarmMilkProduct } from '../farms/entities/farm-milk-product.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { ChangeLog } from '../sync/entities/change-log.entity';
import { User } from '../users/entities/user.entity';
import {
  milkTypeLabel,
  resolveProductName,
} from '../../common/utils/delivery-display.util';
import {
  BulkUpdateDeliveriesDto,
  CreateDeliveryDto,
  DeliveryReportDto,
  GenerateDailyListDto,
  ListDeliveriesDto,
  UpdateDeliveryDto,
} from './dto/delivery.dto';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { MilkDelivery } from './entities/milk-delivery.entity';
import { amountForQuantity } from './utils/delivery-quantity.util';

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(MilkSubscription)
    private readonly subsRepo: Repository<MilkSubscription>,
    @InjectRepository(ChangeLog)
    private readonly changeLogRepo: Repository<ChangeLog>,
    @InjectRepository(DeliveryAssignment)
    private readonly assignmentsRepo: Repository<DeliveryAssignment>,
    @InjectRepository(DeliveryEvent)
    private readonly eventsRepo: Repository<DeliveryEvent>,
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(FarmDeliverySettings)
    private readonly farmDeliverySettingsRepo: Repository<FarmDeliverySettings>,
    @InjectRepository(FarmMember)
    private readonly farmMembersRepo: Repository<FarmMember>,
    @InjectRepository(CustomerAddress)
    private readonly customerAddressesRepo: Repository<CustomerAddress>,
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
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
    const scheduled = roundQty(dto.quantity ?? subscription.defaultQuantity);
    const quantity = this.resolveQuantity(status, scheduled);
    let ratePerLitre = roundMoney(subscription.ratePerLitre);
    if (subscription.farmProductId) {
      const product = await this.productsRepo.findOne({
        where: { id: subscription.farmProductId },
      });
      if (product?.currentRatePerLitre) {
        ratePerLitre = roundMoney(product.currentRatePerLitre);
      }
    }
    const amount = this.resolveAmount(status, quantity, ratePerLitre);

    try {
      const delivery = await this.deliveriesRepo.save(
        this.deliveriesRepo.create({
          supplierId: subscription.supplierId,
          farmId: subscription.farmId,
          customerId: subscription.customerId,
          customerUserId: null,
          customerAddressId: subscription.customerAddressId,
          farmProductId: subscription.farmProductId,
          assignedUserId: subscription.assignedDeliveryUserId,
          subscriptionId: subscription.id,
          deliveryDate: dto.deliveryDate,
          deliveryShift,
          quantity,
          scheduledQuantity: scheduled,
          customerExtraQuantity: roundQty(0),
          staffExtraQuantity: roundQty(0),
          finalDeliveredQuantity:
            status === DeliveryStatus.DELIVERED ? quantity : null,
          ratePerLitre,
          amount,
          status,
          confirmationStatus: DeliveryConfirmationStatus.NOT_CONFIRMED,
          notes: dto.notes ?? null,
          clientReferenceId: dto.clientReferenceId,
          version: 1,
          createdByUserId: user.id,
        }),
      );
      await this.eventsRepo.save(
        this.eventsRepo.create({
          deliveryId: delivery.id,
          eventType: DeliveryEventType.CREATED,
          actorUserId: user.id,
          actorRole: user.role,
          newStatus: delivery.status,
          quantity: delivery.quantity,
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
    const qb = this.deliveriesRepo.createQueryBuilder('d');

    if (user.role === UserRole.DELIVERY_STAFF) {
      // Staff may only see deliveries explicitly assigned to them.
      const assignments = await this.assignmentsRepo.find({
        where: {
          assigneeUserId: user.id,
          status: DeliveryAssignmentStatus.ACTIVE,
        },
        select: ['deliveryId', 'subscriptionId'],
      });
      const deliveryIds = assignments
        .map((a) => a.deliveryId)
        .filter((id): id is string => !!id);
      const subscriptionIds = assignments
        .map((a) => a.subscriptionId)
        .filter((id): id is string => !!id);
      if (deliveryIds.length === 0 && subscriptionIds.length === 0) {
        return { data: [], meta: buildPageMeta(query.page, query.limit, 0) };
      }
      qb.andWhere(
        '(d.id IN (:...deliveryIds) OR d.subscription_id IN (:...subscriptionIds))',
        {
          deliveryIds: deliveryIds.length
            ? deliveryIds
            : ['00000000-0000-0000-0000-000000000000'],
          subscriptionIds: subscriptionIds.length
            ? subscriptionIds
            : ['00000000-0000-0000-0000-000000000000'],
        },
      );
    } else if (user.role !== UserRole.PLATFORM_OWNER) {
      const supplierId = getSupplierIdOrThrow(user);
      qb.andWhere('d.supplier_id = :supplierId', { supplierId });
    }

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

  async report(user: { id: string; role: UserRole }, query: DeliveryReportDto) {
    const dateFrom = query.from ?? query.dateFrom;
    const dateTo = query.to ?? query.dateTo;
    let supplierId: string | undefined;
    if (user.role === UserRole.PLATFORM_OWNER) {
      supplierId = query.supplierId;
    } else {
      supplierId = getSupplierIdOrThrow(user);
    }

    const qb = this.deliveriesRepo.createQueryBuilder('d');

    if (supplierId) {
      qb.andWhere('d.supplier_id = :supplierId', { supplierId });
    }
    if (query.customerId) {
      qb.andWhere('d.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }
    if (dateFrom) {
      qb.andWhere('d.delivery_date >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('d.delivery_date <= :dateTo', { dateTo });
    }
    if (query.status) {
      qb.andWhere('d.status = :status', { status: query.status });
    }

    qb.orderBy('d.delivery_date', query.sortOrder || 'DESC');
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();

    const customerIds = [...new Set(rows.map((r) => r.customerId))];
    const supplierIds = [...new Set(rows.map((r) => r.supplierId))];
    const [customers, suppliers] = await Promise.all([
      customerIds.length
        ? this.deliveriesRepo.manager.find(Customer, {
            where: { id: In(customerIds) },
          })
        : Promise.resolve([] as Customer[]),
      supplierIds.length
        ? this.deliveriesRepo.manager.find(User, {
            where: { id: In(supplierIds) },
          })
        : Promise.resolve([] as User[]),
    ]);
    const customerNameById = new Map(customers.map((c) => [c.id, c.name]));
    const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));

    const data = rows.map((d) => ({
      id: d.id,
      date: d.deliveryDate,
      supplierName: supplierNameById.get(d.supplierId) ?? d.supplierId,
      customerName: customerNameById.get(d.customerId) ?? d.customerId,
      quantityLiters: Number(d.quantity),
      status: d.status,
      syncedAt: d.updatedAt?.toISOString?.() ?? null,
    }));

    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async findOne(user: { id: string; role: UserRole }, id: string) {
    const delivery = await this.loadDeliveryForAccess(user, id);
    const expected = [
      Number(delivery.scheduledQuantity || 0),
      Number(delivery.customerExtraQuantity || 0),
      Number(delivery.staffExtraQuantity || 0),
    ]
      .reduce((a, b) => a + b, 0)
      .toFixed(3);
    const milkType = delivery.subscription?.milkType ?? null;
    let productName: string | null = null;
    if (delivery.farmProductId) {
      const product = await this.productsRepo.findOne({
        where: { id: delivery.farmProductId },
      });
      productName = product?.name ?? null;
    }

    return {
      ...delivery,
      expectedQuantity: expected,
      customerName: delivery.customer?.name,
      mobileNumber: delivery.customer?.mobileNumber,
      address: delivery.customer?.address,
      milkType,
      milkTypeLabel: milkTypeLabel(milkType),
      productName: resolveProductName({ productName, milkType }),
    };
  }

  private async loadDeliveryForAccess(
    user: { id: string; role: UserRole },
    id: string,
  ) {
    const delivery = assertFound(
      await this.deliveriesRepo.findOne({
        where: { id },
        relations: ['customer', 'subscription'],
      }),
      'Delivery not found',
    );
    this.assertCanViewDelivery(user, delivery);
    return delivery;
  }

  private assertCanViewDelivery(
    user: { id: string; role: UserRole },
    delivery: {
      supplierId: string;
      assignedUserId?: string | null;
      subscription?: { assignedDeliveryUserId?: string | null } | null;
    },
  ) {
    if (user.role === UserRole.PLATFORM_OWNER) return;
    if (user.role === UserRole.FARM_OWNER) {
      assertSupplierOwnership(user, delivery.supplierId, 'delivery');
      return;
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      if (
        delivery.assignedUserId === user.id ||
        delivery.subscription?.assignedDeliveryUserId === user.id
      ) {
        return;
      }
      throw new ForbiddenException('Delivery not assigned to you');
    }
    throw new ForbiddenException('You cannot access this delivery');
  }

  async update(
    user: { id: string; role: UserRole },
    id: string,
    dto: UpdateDeliveryDto,
  ) {
    const delivery = await this.loadDeliveryForAccess(user, id);
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
    const delivery = await this.loadDeliveryForAccess(user, id);
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
      .andWhere('s.status = :status', { status: SubscriptionStatus.ACTIVE });
    if (dto.deliveryShift) {
      qb.andWhere('s.delivery_shift = :shift', { shift: dto.deliveryShift });
    }
    const subscriptions = await qb.getMany();
    return this.materializeDailyList(user, dto.date, subscriptions);
  }

  async generateDailyListForFarm(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: GenerateDailyListDto,
  ) {
    const farm = assertFound(
      await this.farmsRepo.findOne({ where: { id: farmId } }),
      'Farm not found',
    );
    if (user.role === UserRole.FARM_OWNER && farm.createdByUserId !== user.id) {
      throw new BadRequestException('Not your farm');
    }
    const qb = this.subsRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: SubscriptionStatus.ACTIVE })
      .andWhere('(s.farm_id = :farmId OR s.supplier_id = :ownerId)', {
        farmId,
        ownerId: farm.createdByUserId,
      });
    if (dto.deliveryShift) {
      qb.andWhere('s.delivery_shift = :shift', { shift: dto.deliveryShift });
    }
    const subscriptions = await qb.getMany();
    const result = await this.materializeDailyList(
      user,
      dto.date,
      subscriptions,
      farmId,
    );
    await this.markDailyListGenerated(farmId, dto.date);
    return result;
  }

  async getDailyListStatus(
    user: { id: string; role: UserRole },
    farmId: string,
    date?: string,
  ) {
    const farm = assertFound(
      await this.farmsRepo.findOne({ where: { id: farmId } }),
      'Farm not found',
    );
    await this.assertCanViewFarmDailyList(user, farm);
    const targetDate = date || todayIso();
    const settings = await this.getOrCreateFarmDeliverySettings(farmId);
    const deliveryCount = await this.deliveriesRepo.count({
      where: { farmId, deliveryDate: targetDate },
    });
    const generated =
      settings.lastDailyListGeneratedDate === targetDate || deliveryCount > 0;
    return {
      date: targetDate,
      generated,
      deliveryCount,
      lastGeneratedAt: settings.lastDailyListGeneratedAt,
      lastGeneratedDate: settings.lastDailyListGeneratedDate,
      autoGenerateDailyList: settings.autoGenerateDailyList,
    };
  }

  /**
   * Idempotent morning job: for each farm with auto-generate on, materialize
   * today's list once per IST calendar date using the farm owner as actor.
   */
  async runScheduledDailyListGeneration() {
    const today = todayIso();
    const farms = await this.farmsRepo.find();
    const summary = { farmsConsidered: 0, generated: 0, skipped: 0, failed: 0 };
    for (const farm of farms) {
      summary.farmsConsidered += 1;
      const settings = await this.getOrCreateFarmDeliverySettings(farm.id);
      if (!settings.autoGenerateDailyList) {
        summary.skipped += 1;
        continue;
      }
      if (settings.lastDailyListGeneratedDate === today) {
        summary.skipped += 1;
        continue;
      }
      try {
        await this.generateDailyListForFarm(
          { id: farm.createdByUserId, role: UserRole.FARM_OWNER },
          farm.id,
          { date: today },
        );
        summary.generated += 1;
      } catch {
        summary.failed += 1;
      }
    }
    return summary;
  }

  private async markDailyListGenerated(farmId: string, date: string) {
    const settings = await this.getOrCreateFarmDeliverySettings(farmId);
    settings.lastDailyListGeneratedAt = new Date();
    settings.lastDailyListGeneratedDate = date;
    await this.farmDeliverySettingsRepo.save(settings);
  }

  private async getOrCreateFarmDeliverySettings(farmId: string) {
    let settings = await this.farmDeliverySettingsRepo.findOne({
      where: { farmId },
    });
    if (!settings) {
      settings = await this.farmDeliverySettingsRepo.save(
        this.farmDeliverySettingsRepo.create({ farmId }),
      );
    }
    return settings;
  }

  private async assertCanViewFarmDailyList(
    user: { id: string; role: UserRole },
    farm: Farm,
  ) {
    if (user.role === UserRole.PLATFORM_OWNER) return;
    if (user.role === UserRole.FARM_OWNER && farm.createdByUserId === user.id) {
      return;
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      const member = await this.farmMembersRepo.findOne({
        where: {
          farmId: farm.id,
          userId: user.id,
          status: FarmMemberStatus.ACTIVE,
        },
      });
      if (member) return;
      const assignment = await this.assignmentsRepo.findOne({
        where: {
          farmId: farm.id,
          assigneeUserId: user.id,
          status: DeliveryAssignmentStatus.ACTIVE,
        },
      });
      if (assignment) return;
    }
    throw new ForbiddenException('Not allowed for this farm');
  }

  private async materializeDailyList(
    user: { id: string; role: UserRole },
    date: string,
    subscriptions: MilkSubscription[],
    farmId?: string,
  ) {
    let created = 0;
    let skipped = 0;
    const deliveries: MilkDelivery[] = [];

    const subIds = subscriptions.map((sub) => sub.id);
    const existingDeliveries = subIds.length
      ? await this.deliveriesRepo.find({
          where: { subscriptionId: In(subIds), deliveryDate: date },
        })
      : [];
    const existingByKey = new Map(
      existingDeliveries.map((d) => [
        `${d.subscriptionId}|${d.deliveryShift}`,
        d,
      ]),
    );

    const customerIds = [
      ...new Set(subscriptions.map((sub) => sub.customerId)),
    ];
    const customers = customerIds.length
      ? await this.deliveriesRepo.manager.find(Customer, {
          where: { id: In(customerIds) },
        })
      : [];
    const customerById = new Map(customers.map((c) => [c.id, c]));

    const productIds = [
      ...new Set(
        subscriptions
          .map((s) => s.farmProductId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const products = productIds.length
      ? await this.productsRepo.find({ where: { id: In(productIds) } })
      : [];
    const rateByProductId = new Map(
      products.map((p) => [p.id, p.currentRatePerLitre]),
    );

    for (const sub of subscriptions) {
      if (!isDeliveryRequiredOnDate(sub, date)) {
        skipped += 1;
        continue;
      }
      const existing = existingByKey.get(`${sub.id}|${sub.deliveryShift}`);
      if (existing) {
        skipped += 1;
        deliveries.push(existing);
        continue;
      }

      const customer = customerById.get(sub.customerId);
      const scheduled = roundQty(sub.defaultQuantity);
      // Market rate lives on the product; subscription rate is a fallback.
      const ratePerLitre = roundMoney(
        (sub.farmProductId && rateByProductId.get(sub.farmProductId)) ||
          sub.ratePerLitre,
      );
      const delivery = await this.deliveriesRepo.save(
        this.deliveriesRepo.create({
          supplierId: sub.supplierId,
          farmId: farmId ?? sub.farmId,
          customerId: sub.customerId,
          customerUserId: customer?.customerUserId ?? null,
          customerAddressId: sub.customerAddressId,
          farmProductId: sub.farmProductId,
          assignedUserId: sub.assignedDeliveryUserId,
          subscriptionId: sub.id,
          deliveryDate: date,
          deliveryShift: sub.deliveryShift,
          quantity: scheduled,
          scheduledQuantity: scheduled,
          customerExtraQuantity: roundQty(0),
          staffExtraQuantity: roundQty(0),
          finalDeliveredQuantity: null,
          ratePerLitre,
          amount: amountForQuantity(scheduled, ratePerLitre),
          status: DeliveryStatus.PENDING,
          confirmationStatus: DeliveryConfirmationStatus.NOT_CONFIRMED,
          clientReferenceId: uuidv4(),
          version: 1,
          createdByUserId: user.id,
        }),
      );
      await this.eventsRepo.save(
        this.eventsRepo.create({
          deliveryId: delivery.id,
          eventType: DeliveryEventType.CREATED,
          actorUserId: user.id,
          actorRole: user.role,
          newStatus: delivery.status,
          quantity: scheduled,
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

  async todayForStaff(
    user: { id: string; role: UserRole },
    filters: {
      status?: DeliveryStatus;
      shift?: string;
      date?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    const iso = (v?: string) =>
      v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
    let fromDate = iso(filters.from) ?? iso(filters.date) ?? todayIso();
    let toDate = iso(filters.to) ?? fromDate;
    if (fromDate > toDate) {
      const swap = fromDate;
      fromDate = toDate;
      toDate = swap;
    }

    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'c')
      .leftJoinAndSelect('d.subscription', 'sub')
      .where('d.delivery_date >= :fromDate', { fromDate })
      .andWhere('d.delivery_date <= :toDate', { toDate })
      .andWhere('d.status != :cancelled', {
        cancelled: DeliveryStatus.CANCELLED,
      })
      .orderBy('d.delivery_date', 'ASC')
      .addOrderBy('d.delivery_sequence', 'ASC', 'NULLS LAST')
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
    const addressById = await this.loadAddressMapForDeliveries(rows);
    const productNameById = await this.loadProductNameMap(rows);

    return rows.map((d) => {
      const expected = [
        Number(d.scheduledQuantity || 0),
        Number(d.customerExtraQuantity || 0),
        Number(d.staffExtraQuantity || 0),
      ]
        .reduce((a, b) => a + b, 0)
        .toFixed(3);
      const mapped = addressById.get(d.id);
      const milkType = d.subscription?.milkType ?? null;
      const productName = resolveProductName({
        productName: d.farmProductId
          ? productNameById.get(d.farmProductId)
          : null,
        milkType,
      });
      return {
        ...d,
        expectedQuantity: expected,
        customerName: d.customer?.name,
        mobileNumber: d.customer?.mobileNumber,
        address: mapped?.addressText ?? d.customer?.address ?? null,
        latitude: mapped?.latitude ?? null,
        longitude: mapped?.longitude ?? null,
        hasMapPin: Boolean(mapped?.latitude && mapped?.longitude),
        milkType,
        milkTypeLabel: milkTypeLabel(milkType),
        productName,
        ratePerLitre: d.ratePerLitre,
      };
    });
  }

  private async loadProductNameMap(rows: MilkDelivery[]) {
    const productIds = [
      ...new Set(
        rows
          .map((d) => d.farmProductId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!productIds.length) return new Map<string, string>();
    const products = await this.productsRepo.find({
      where: { id: In(productIds) },
    });
    return new Map(products.map((p) => [p.id, p.name]));
  }

  private async loadAddressMapForDeliveries(rows: MilkDelivery[]) {
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
        ? this.customerAddressesRepo.find({ where: { id: In(addressIds) } })
        : Promise.resolve([] as CustomerAddress[]),
      customerUserIds.length
        ? this.customerAddressesRepo.find({
            where: { customerUserId: In(customerUserIds), isDefault: true },
          })
        : Promise.resolve([] as CustomerAddress[]),
    ]);

    const byId = new Map(byIdRows.map((a) => [a.id, a]));
    const defaultByUser = new Map(
      defaultRows.map((a) => [a.customerUserId, a]),
    );

    const formatAddress = (a: CustomerAddress) =>
      [a.addressLine1, a.addressLine2, a.area, a.city, a.state, a.postalCode]
        .filter(Boolean)
        .join(', ');

    const result = new Map<
      string,
      {
        addressText: string;
        latitude: string | null;
        longitude: string | null;
      }
    >();

    for (const d of rows) {
      const address =
        (d.customerAddressId ? byId.get(d.customerAddressId) : undefined) ??
        (d.customerUserId ? defaultByUser.get(d.customerUserId) : undefined);
      if (!address) continue;
      result.set(d.id, {
        addressText: formatAddress(address),
        latitude: address.latitude,
        longitude: address.longitude,
      });
    }
    return result;
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

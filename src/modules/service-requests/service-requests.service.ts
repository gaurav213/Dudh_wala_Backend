import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  ConnectionStatus,
  FarmMemberStatus,
  NotificationType,
  ReviewStatus,
  ServiceAreaStatus,
  ServiceRequestStatus,
  SubscriptionScheduleType,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import {
  nextDeliveryDates,
  weekdayFromIsoDate,
} from '../../common/utils/subscription-schedule.util';
import { roundQty } from '../../common/utils/decimal.util';
import { assertFound } from '../../common/utils/ownership.util';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { AuditService } from '../audit/audit.service';
import { ConnectionsService } from '../connections/connections.service';
import { CustomerAddress } from '../customer-addresses/entities/customer-address.entity';
import { FarmMilkProduct } from '../farms/entities/farm-milk-product.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { FarmServiceArea } from '../farms/entities/farm-service-area.entity';
import { Farm } from '../farms/entities/farm.entity';
import { matchesServiceArea } from '../farms/farm-search.util';
import { FarmsService } from '../farms/farms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CustomerReview } from '../reviews/entities/customer-review.entity';
import { Customer } from '../customers/entities/customer.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { User } from '../users/entities/user.entity';
import {
  AcceptServiceRequestDto,
  CreateServiceRequestDto,
  ListServiceRequestsDto,
  RejectServiceRequestDto,
  UpdateServiceRequestDto,
} from './dto/service-request.dto';
import { CustomerServiceRequest } from './entities/customer-service-request.entity';
import {
  resolveEffectiveStartDate,
  validateServiceRequestAgainstProduct,
} from './service-request-validation.util';

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

@Injectable()
export class ServiceRequestsService {
  constructor(
    @InjectRepository(CustomerServiceRequest)
    private readonly requestsRepo: Repository<CustomerServiceRequest>,
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
    @InjectRepository(FarmServiceArea)
    private readonly serviceAreasRepo: Repository<FarmServiceArea>,
    @InjectRepository(CustomerAddress)
    private readonly addressesRepo: Repository<CustomerAddress>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(CustomerReview)
    private readonly customerReviewsRepo: Repository<CustomerReview>,
    @InjectRepository(MilkSubscription)
    private readonly subscriptionsRepo: Repository<MilkSubscription>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly farmsService: FarmsService,
    private readonly connectionsService: ConnectionsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    user: { id: string; role: UserRole },
    dto: CreateServiceRequestDto,
  ) {
    const farm = await this.farmsService.getActiveFarmOrFail(dto.farmId);

    const product = await this.productsRepo.findOne({
      where: { id: dto.productId, farmId: dto.farmId },
    });
    if (!product) {
      throw new NotFoundException('Product not found for this farm');
    }

    const address = assertFound(
      await this.addressesRepo.findOne({ where: { id: dto.addressId } }),
      'Address not found',
    );
    if (address.customerUserId !== user.id) {
      throw new ForbiddenException('You do not own this address');
    }

    const quantity = roundQty(dto.quantity);
    const errors = validateServiceRequestAgainstProduct(
      { quantity, deliveryShift: dto.deliveryShift },
      {
        isAvailable: product.isAvailable,
        minimumQuantity: product.minimumQuantity,
        maximumQuantity: product.maximumQuantity,
        availableShifts: product.availableShifts,
      },
    );
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Service request does not meet product constraints',
        errors,
      });
    }

    const areas = await this.serviceAreasRepo.find({
      where: { farmId: dto.farmId, status: ServiceAreaStatus.ACTIVE },
    });
    const served = areas.some(
      (area) =>
        matchesServiceArea(area, { postalCode: address.postalCode }) ||
        matchesServiceArea(area, {
          area: address.area,
          city: address.city,
        }) ||
        matchesServiceArea(area, { city: address.city }),
    );
    if (!served) {
      throw new BadRequestException(
        'This farm does not currently serve your address',
      );
    }

    const existingForProduct = await this.requestsRepo.findOne({
      where: {
        farmId: dto.farmId,
        customerUserId: user.id,
        productId: dto.productId,
        status: In([
          ServiceRequestStatus.PENDING,
          ServiceRequestStatus.ACCEPTED,
        ]),
      },
    });
    if (existingForProduct) {
      throw new ConflictException(
        existingForProduct.status === ServiceRequestStatus.PENDING
          ? 'You already have a pending request for this product'
          : 'You already have an accepted request for this product',
      );
    }

    const connectionStatus = await this.connectionsService.getConnectionStatus(
      dto.farmId,
      user.id,
    );
    if (connectionStatus === ConnectionStatus.BLOCKED) {
      throw new ForbiddenException('You are blocked from this farm');
    }

    // Active farm connection is OK for a *different* product; only block if
    // this milk type already has an active subscription.
    const ledger = await this.customersRepo.find({
      where: { customerUserId: user.id },
    });
    if (ledger.length) {
      const activeSub = await this.subscriptionsRepo.findOne({
        where: {
          farmId: dto.farmId,
          customerId: In(ledger.map((c) => c.id)),
          milkType: product.milkType,
          status: SubscriptionStatus.ACTIVE,
        },
      });
      if (activeSub) {
        throw new ConflictException(
          'You already have an active subscription for this product type with this farm',
        );
      }
    }

    const saved = await this.requestsRepo.save(
      this.requestsRepo.create({
        farmId: dto.farmId,
        customerUserId: user.id,
        addressId: dto.addressId,
        productId: dto.productId,
        quantity,
        deliveryShift: dto.deliveryShift,
        scheduleType: dto.scheduleType ?? SubscriptionScheduleType.EVERY_DAY,
        preferredStartDate: dto.preferredStartDate,
        deliveryInstructions: dto.deliveryInstructions ?? null,
        status: ServiceRequestStatus.PENDING,
      }),
    );

    const customer = await this.usersRepo.findOne({ where: { id: user.id } });
    const farmRecipients = await this.farmNotifyRecipients(dto.farmId, farm);
    await this.notifications.notify({
      type: NotificationType.SERVICE_REQUEST_CREATED,
      title: 'New milk request',
      body: `${customer?.name ?? 'A customer'} requested ${quantity} L ${product.name}`,
      messageKey: 'notifServiceRequestCreated',
      params: {
        name: customer?.name ?? 'A customer',
        qty: quantity,
        product: product.name,
      },
      recipientUserIds: farmRecipients,
      route: `/farm/requests/${saved.id}`,
      farmId: dto.farmId,
      entityType: 'SERVICE_REQUEST',
      entityId: saved.id,
      data: {
        type: 'MILK_REQUEST',
        requestId: saved.id,
        farmId: dto.farmId,
      },
      createdByUserId: user.id,
    });

    return saved;
  }

  async findMy(user: { id: string }, query: ListServiceRequestsDto) {
    const qb = this.requestsRepo
      .createQueryBuilder('r')
      .where('r.customer_user_id = :customerUserId', {
        customerUserId: user.id,
      });
    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }
    if (query.farmId) {
      qb.andWhere('r.farm_id = :farmId', { farmId: query.farmId });
    }
    qb.orderBy('r.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    const data = await this.enrichForCustomer(rows);
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async findOneForCustomer(user: { id: string }, id: string) {
    const request = assertFound(
      await this.requestsRepo.findOne({ where: { id } }),
      'Service request not found',
    );
    if (request.customerUserId !== user.id) {
      throw new ForbiddenException('You do not own this request');
    }
    const [enriched] = await this.enrichForCustomer([request]);
    return enriched;
  }

  async updateMy(
    user: { id: string },
    id: string,
    dto: UpdateServiceRequestDto,
  ) {
    const request = assertFound(
      await this.requestsRepo.findOne({ where: { id } }),
      'Service request not found',
    );
    if (request.customerUserId !== user.id) {
      throw new ForbiddenException('You do not own this request');
    }
    if (request.status !== ServiceRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be edited');
    }

    const product = assertFound(
      await this.productsRepo.findOne({
        where: { id: request.productId, farmId: request.farmId },
      }),
      'Product not found',
    );

    if (dto.addressId) {
      const address = assertFound(
        await this.addressesRepo.findOne({ where: { id: dto.addressId } }),
        'Address not found',
      );
      if (address.customerUserId !== user.id) {
        throw new ForbiddenException('You do not own this address');
      }
      request.addressId = dto.addressId;
    }

    const quantity = dto.quantity ? roundQty(dto.quantity) : request.quantity;
    const deliveryShift = dto.deliveryShift ?? request.deliveryShift;
    const errors = validateServiceRequestAgainstProduct(
      { quantity, deliveryShift },
      {
        isAvailable: product.isAvailable,
        minimumQuantity: product.minimumQuantity,
        maximumQuantity: product.maximumQuantity,
        availableShifts: product.availableShifts,
      },
    );
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Service request does not meet product constraints',
        errors,
      });
    }

    request.quantity = quantity;
    request.deliveryShift = deliveryShift;
    if (dto.scheduleType !== undefined) request.scheduleType = dto.scheduleType;
    if (dto.preferredStartDate !== undefined) {
      request.preferredStartDate = dto.preferredStartDate;
    }
    if (dto.deliveryInstructions !== undefined) {
      request.deliveryInstructions = dto.deliveryInstructions || null;
    }
    return this.requestsRepo.save(request);
  }

  async cancel(user: { id: string }, id: string) {
    const request = assertFound(
      await this.requestsRepo.findOne({ where: { id } }),
      'Service request not found',
    );
    if (request.customerUserId !== user.id) {
      throw new ForbiddenException('You do not own this request');
    }
    if (request.status !== ServiceRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    request.status = ServiceRequestStatus.CANCELLED;
    const saved = await this.requestsRepo.save(request);

    const [customer, farm, product] = await Promise.all([
      this.usersRepo.findOne({ where: { id: user.id } }),
      this.farmsRepo.findOne({ where: { id: request.farmId } }),
      this.productsRepo.findOne({ where: { id: request.productId } }),
    ]);
    if (farm) {
      const farmRecipients = await this.farmNotifyRecipients(
        request.farmId,
        farm,
      );
      await this.notifications.notify({
        type: NotificationType.SERVICE_REQUEST_CANCELLED,
        title: 'Milk request cancelled',
        body: `${customer?.name ?? 'A customer'} cancelled the ${product?.name ?? 'milk'} request.`,
        messageKey: 'notifServiceRequestCancelled',
        params: {
          name: customer?.name ?? 'A customer',
          product: product?.name ?? 'milk',
        },
        recipientUserIds: farmRecipients,
        route: `/farm/requests/${saved.id}`,
        farmId: request.farmId,
        entityType: 'SERVICE_REQUEST',
        entityId: saved.id,
        data: {
          type: 'MILK_REQUEST_CANCELLED',
          requestId: saved.id,
          farmId: request.farmId,
        },
        createdByUserId: user.id,
      });
    }
    return saved;
  }

  async listForFarm(
    user: { id: string; role: UserRole },
    farmId: string,
    query: ListServiceRequestsDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const qb = this.requestsRepo
      .createQueryBuilder('r')
      .where('r.farm_id = :farmId', { farmId });
    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    } else {
      // Default inbox: pending above accepted, exclude closed statuses.
      qb.andWhere('r.status IN (:...statuses)', {
        statuses: [
          ServiceRequestStatus.PENDING,
          ServiceRequestStatus.ACCEPTED,
        ],
      });
    }
    qb.addSelect(
      `CASE WHEN r.status = '${ServiceRequestStatus.PENDING}' THEN 0 ELSE 1 END`,
      'status_rank',
    )
      .orderBy('status_rank', 'ASC')
      .addOrderBy('r.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    const data = await this.enrichForFarm(rows);
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async findOneForFarm(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const request = assertFound(
      await this.requestsRepo.findOne({ where: { id, farmId } }),
      'Service request not found',
    );
    const [enriched] = await this.enrichForFarm([request]);
    return enriched;
  }

  async cancelForFarm(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const request = assertFound(
      await this.requestsRepo.findOne({ where: { id, farmId } }),
      'Service request not found',
    );
    if (request.status !== ServiceRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    request.status = ServiceRequestStatus.CANCELLED;
    const saved = await this.requestsRepo.save(request);
    const [farm, product] = await Promise.all([
      this.farmsRepo.findOne({ where: { id: farmId } }),
      this.productsRepo.findOne({ where: { id: request.productId } }),
    ]);
    await this.notifications.notify({
      type: NotificationType.SERVICE_REQUEST_CANCELLED,
      title: 'Milk request cancelled',
      body: `${farm?.name ?? 'Farm'} cancelled your ${product?.name ?? 'milk'} request.`,
      messageKey: 'notifServiceRequestCancelledByFarm',
      params: {
        farm: farm?.name ?? 'Farm',
        product: product?.name ?? 'milk',
      },
      recipientUserIds: [request.customerUserId],
      route: `/customer/requests?focus=${saved.id}`,
      farmId,
      entityType: 'SERVICE_REQUEST',
      entityId: saved.id,
      data: {
        type: 'MILK_REQUEST_CANCELLED',
        requestId: saved.id,
        farmId,
      },
      createdByUserId: user.id,
    });
    await this.auditService.log({
      actorUserId: user.id,
      farmId,
      entityType: 'SERVICE_REQUEST',
      entityId: id,
      action: 'SERVICE_REQUEST_CANCELLED',
    });
    return saved;
  }

  async accept(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
    dto: AcceptServiceRequestDto,
  ) {
    const membership = await this.farmsService.assertActiveOwner(user, farmId);
    const farmOwnerUserId = membership.userId;

    const result = await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(CustomerServiceRequest, {
        where: { id, farmId },
      });
      if (!request) throw new NotFoundException('Service request not found');
      if (request.status !== ServiceRequestStatus.PENDING) {
        throw new BadRequestException('Only pending requests can be accepted');
      }
      const product = await manager.findOne(FarmMilkProduct, {
        where: { id: request.productId },
      });
      if (!product) throw new NotFoundException('Product not found');
      const customerUser = await manager.findOne(User, {
        where: { id: request.customerUserId },
      });
      if (!customerUser) throw new NotFoundException('Customer not found');
      const farm = await manager.findOne(Farm, { where: { id: farmId } });

      const startDate = resolveEffectiveStartDate(
        request.preferredStartDate,
        todayIso(),
      );
      const scheduleType =
        request.scheduleType ?? SubscriptionScheduleType.EVERY_DAY;
      const deliveryDays =
        scheduleType === SubscriptionScheduleType.WEEKLY
          ? [weekdayFromIsoDate(startDate)]
          : null;

      const { connection, subscription } =
        await this.connectionsService.acceptIntoSubscription(manager, {
          farmId,
          farmOwnerUserId,
          customerUserId: request.customerUserId,
          customerName: customerUser.name,
          mobileNumber: customerUser.mobileNumber,
          milkType: product.milkType,
          quantity: request.quantity,
          ratePerLitre: product.currentRatePerLitre,
          deliveryShift: request.deliveryShift,
          startDate,
          scheduleType,
          deliveryDays,
          assignedDeliveryUserId: dto.assignedMemberUserId ?? null,
          farmProductId: product.id,
        });

      if (dto.assignedMemberUserId) {
        await this.subscriptionsService.applyAssignment(manager, {
          subscription,
          farmId,
          assigneeUserId: dto.assignedMemberUserId,
          assignedByUserId: user.id,
        });
      }

      request.status = ServiceRequestStatus.ACCEPTED;
      request.assignedMemberUserId = dto.assignedMemberUserId ?? null;
      const savedRequest = await manager.save(request);

      return {
        request: savedRequest,
        connection,
        subscription,
        product,
        farmName: farm?.name ?? 'Farm',
      };
    });

    await this.auditService.log({
      actorUserId: user.id,
      farmId,
      entityType: 'SERVICE_REQUEST',
      entityId: id,
      action: 'SERVICE_REQUEST_ACCEPTED',
      newValues: { subscriptionId: result.subscription.id },
    });

    const dates = nextDeliveryDates({
      startDate: result.subscription.startDate,
      scheduleType: result.subscription.scheduleType,
      deliveryDays: result.subscription.deliveryDays,
      count: 2,
      fromDate: todayIso(),
    });

    await this.notifications.notify({
      type: NotificationType.SERVICE_REQUEST_ACCEPTED,
      title: 'Milk request accepted',
      body: `Your milk request has been accepted by ${result.farmName}.`,
      messageKey: 'notifServiceRequestAccepted',
      params: { farm: result.farmName },
      recipientUserIds: [result.request.customerUserId],
      route: `/customer/requests?focus=${id}`,
      farmId,
      entityType: 'SERVICE_REQUEST',
      entityId: id,
      data: {
        type: 'MILK_REQUEST_ACCEPTED',
        requestId: id,
        farmId,
        subscriptionId: result.subscription.id,
        firstDeliveryDate: dates[0] ?? null,
        nextDeliveryDate: dates[1] ?? dates[0] ?? null,
      },
      createdByUserId: user.id,
    });

    return {
      request: result.request,
      connection: result.connection,
      subscription: result.subscription,
      firstDeliveryDate: dates[0] ?? null,
      nextDeliveryDate: dates[1] ?? dates[0] ?? null,
    };
  }

  async reject(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
    dto: RejectServiceRequestDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const request = assertFound(
      await this.requestsRepo.findOne({ where: { id, farmId } }),
      'Service request not found',
    );
    if (request.status !== ServiceRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be rejected');
    }
    request.status = ServiceRequestStatus.REJECTED;
    request.rejectionReason = dto.rejectionReason ?? null;
    const saved = await this.requestsRepo.save(request);
    await this.auditService.log({
      actorUserId: user.id,
      farmId,
      entityType: 'SERVICE_REQUEST',
      entityId: id,
      action: 'SERVICE_REQUEST_REJECTED',
      newValues: { rejectionReason: saved.rejectionReason },
    });
    return saved;
  }

  private async farmNotifyRecipients(farmId: string, farm: Farm) {
    const members = await this.membersRepo.find({
      where: { farmId, status: FarmMemberStatus.ACTIVE },
    });
    const ids = members.map((m) => m.userId);
    ids.push(farm.createdByUserId);
    return [...new Set(ids.filter(Boolean))];
  }

  private async enrichForFarm(rows: CustomerServiceRequest[]) {
    if (!rows.length) return [];
    const customerIds = [...new Set(rows.map((r) => r.customerUserId))];
    const productIds = [...new Set(rows.map((r) => r.productId))];
    const addressIds = [...new Set(rows.map((r) => r.addressId))];

    const [customers, products, addresses, ratingRows] = await Promise.all([
      this.usersRepo.find({ where: { id: In(customerIds) } }),
      this.productsRepo.find({ where: { id: In(productIds) } }),
      this.addressesRepo.find({ where: { id: In(addressIds) } }),
      this.customerReviewsRepo
        .createQueryBuilder('r')
        .select('r.customerUserId', 'customerUserId')
        .addSelect('AVG(r.rating)', 'avg')
        .addSelect('COUNT(*)', 'count')
        .where('r.customerUserId IN (:...ids)', { ids: customerIds })
        .andWhere('r.status = :status', { status: ReviewStatus.PUBLISHED })
        .groupBy('r.customerUserId')
        .getRawMany<{
          customerUserId: string;
          avg: string;
          count: string;
        }>(),
    ]);

    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const productMap = new Map(products.map((p) => [p.id, p]));
    const addressMap = new Map(addresses.map((a) => [a.id, a]));
    const ratingMap = new Map(
      ratingRows.map((r) => [
        r.customerUserId,
        {
          averageRating: Number(Number(r.avg).toFixed(1)),
          reviewCount: Number(r.count),
        },
      ]),
    );

    return rows.map((r) => {
      const customer = customerMap.get(r.customerUserId);
      const product = productMap.get(r.productId);
      const address = addressMap.get(r.addressId);
      const rating = ratingMap.get(r.customerUserId);
      return {
        ...r,
        scheduleType: r.scheduleType ?? SubscriptionScheduleType.EVERY_DAY,
        customerName: customer?.name ?? null,
        customerMobileNumber: customer?.mobileNumber ?? null,
        customerAvatarUrl: customer?.avatarUrl ?? null,
        customerAverageRating: rating?.averageRating ?? null,
        customerReviewCount: rating?.reviewCount ?? 0,
        productName: product?.name ?? null,
        milkType: product?.milkType ?? null,
        addressSummary: address
          ? [address.addressLine1, address.area, address.city]
              .filter(Boolean)
              .join(', ')
          : null,
      };
    });
  }

  private async enrichForCustomer(rows: CustomerServiceRequest[]) {
    if (!rows.length) return [];
    const farmIds = [...new Set(rows.map((r) => r.farmId))];
    const productIds = [...new Set(rows.map((r) => r.productId))];
    const [farms, products] = await Promise.all([
      this.farmsRepo.find({ where: { id: In(farmIds) } }),
      this.productsRepo.find({ where: { id: In(productIds) } }),
    ]);
    const farmMap = new Map(farms.map((f) => [f.id, f]));
    const productMap = new Map(products.map((p) => [p.id, p]));

    return rows.map((r) => {
      const farm = farmMap.get(r.farmId);
      const product = productMap.get(r.productId);
      const scheduleType =
        r.scheduleType ?? SubscriptionScheduleType.EVERY_DAY;
      const startDate = resolveEffectiveStartDate(
        r.preferredStartDate,
        todayIso(),
      );
      const deliveryDays =
        scheduleType === SubscriptionScheduleType.WEEKLY
          ? [weekdayFromIsoDate(startDate)]
          : null;
      const dates =
        r.status === ServiceRequestStatus.ACCEPTED
          ? nextDeliveryDates({
              startDate,
              scheduleType,
              deliveryDays,
              count: 2,
              fromDate: todayIso(),
            })
          : [];
      return {
        ...r,
        scheduleType,
        farmName: farm?.name ?? null,
        productName: product?.name ?? null,
        milkType: product?.milkType ?? null,
        firstDeliveryDate: dates[0] ?? null,
        nextDeliveryDate: dates[1] ?? dates[0] ?? null,
      };
    });
  }
}

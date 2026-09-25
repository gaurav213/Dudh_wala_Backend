import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  ConnectionStatus,
  CustomerStatus,
  DeliveryShift,
  InvitationStatus,
  MilkType,
  SubscriptionScheduleType,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import { todayIso } from '../../common/utils/date.util';
import { normalizeMobileNumber } from '../../common/utils/mobile.util';
import { weekdayFromIsoDate } from '../../common/utils/subscription-schedule.util';
import { assertFound } from '../../common/utils/ownership.util';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { Customer } from '../customers/entities/customer.entity';
import { FarmCustomerInvitation } from '../customer-invitations/entities/farm-customer-invitation.entity';
import { FarmsService } from '../farms/farms.service';
import { resolveEffectiveStartDate } from '../service-requests/service-request-validation.util';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { ChangeLog } from '../sync/entities/change-log.entity';
import { ListConnectionsDto } from './dto/connection.dto';
import { CreateManagedCustomerDto } from './dto/managed-customer.dto';
import { FarmCustomerConnection } from './entities/farm-customer-connection.entity';

export interface AcceptIntoSubscriptionParams {
  farmId: string;
  farmOwnerUserId: string;
  customerUserId: string;
  customerName: string;
  mobileNumber: string | null;
  milkType: MilkType;
  quantity: string;
  ratePerLitre: string;
  deliveryShift: DeliveryShift;
  startDate: string;
  scheduleType?: SubscriptionScheduleType;
  deliveryDays?: number[] | null;
  /** Optional delivery staff user id to assign immediately. */
  assignedDeliveryUserId?: string | null;
  /** Marketplace product the customer requested (needed for rate-change fan-out). */
  farmProductId?: string | null;
}

@Injectable()
export class ConnectionsService {
  constructor(
    @InjectRepository(FarmCustomerConnection)
    private readonly connectionsRepo: Repository<FarmCustomerConnection>,
    @InjectRepository(MilkSubscription)
    private readonly subsRepo: Repository<MilkSubscription>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly farmsService: FarmsService,
  ) {}

  private mapSubs(subs: MilkSubscription[]) {
    return subs.map((s) => ({
      id: s.id,
      milkType: s.milkType,
      defaultQuantity: s.defaultQuantity,
      deliveryShift: s.deliveryShift,
      ratePerLitre: s.ratePerLitre,
      assignedDeliveryUserId: s.assignedDeliveryUserId,
      assignedDeliveryUserName: s.assignedDeliveryUser?.name ?? null,
      status: s.status,
      startDate: s.startDate,
    }));
  }

  async listCustomers(
    user: { id: string; role: UserRole },
    farmId: string,
    query: ListConnectionsDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const farmOwnerUserId =
      await this.farmsService.getFarmOwnerUserId(farmId);

    const qb = this.connectionsRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.customerUser', 'customerUser')
      .where('c.farmId = :farmId', { farmId });
    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }
    qb.orderBy('c.createdAt', 'DESC');
    const connections = await qb.getMany();

    const userIds = connections.map((c) => c.customerUserId);
    const ledgerCustomers = userIds.length
      ? await this.customersRepo.find({
          where: { customerUserId: In(userIds) },
        })
      : [];
    const ledgerByUserId = new Map(
      ledgerCustomers
        .filter((c) => c.customerUserId)
        .map((c) => [c.customerUserId as string, c]),
    );
    const connectionLedgerIds = ledgerCustomers.map((c) => c.id);

    // Farm-managed: ledger rows with no app account for this farm owner.
    const includeManaged =
      !query.status || query.status === ConnectionStatus.ACTIVE;
    const managedLedgers = includeManaged
      ? await this.customersRepo.find({
          where: {
            supplierId: farmOwnerUserId,
            customerUserId: IsNull(),
            status: CustomerStatus.ACTIVE,
          },
          order: { createdAt: 'DESC' },
        })
      : [];

    const allLedgerIds = [
      ...connectionLedgerIds,
      ...managedLedgers.map((c) => c.id),
    ];
    const subscriptions = allLedgerIds.length
      ? await this.subsRepo.find({
          where: {
            customerId: In(allLedgerIds),
            farmId,
            status: SubscriptionStatus.ACTIVE,
          },
          relations: ['assignedDeliveryUser'],
          order: { createdAt: 'DESC' },
        })
      : [];
    const subsByCustomerId = new Map<string, MilkSubscription[]>();
    for (const sub of subscriptions) {
      const list = subsByCustomerId.get(sub.customerId) ?? [];
      list.push(sub);
      subsByCustomerId.set(sub.customerId, list);
    }

    const connectedRows = connections.map((connection) => {
      const ledger = ledgerByUserId.get(connection.customerUserId);
      const subs = ledger ? (subsByCustomerId.get(ledger.id) ?? []) : [];
      return {
        ...connection,
        source: 'CONNECTION' as const,
        ledgerCustomerId: ledger?.id ?? null,
        name: connection.customerUser?.name ?? null,
        mobileNumber: connection.customerUser?.mobileNumber ?? null,
        subscriptions: this.mapSubs(subs),
      };
    });

    const managedRows = managedLedgers
      .filter((ledger) => (subsByCustomerId.get(ledger.id) ?? []).length > 0)
      .map((ledger) => {
        const subs = subsByCustomerId.get(ledger.id) ?? [];
        return {
          id: ledger.id,
          farmId,
          customerUserId: null,
          customerUser: null,
          status: ConnectionStatus.ACTIVE,
          connectedAt: null,
          blockedAt: null,
          notes: ledger.notes,
          createdAt: ledger.createdAt,
          updatedAt: ledger.updatedAt,
          source: 'MANAGED' as const,
          ledgerCustomerId: ledger.id,
          name: ledger.name,
          mobileNumber: ledger.mobileNumber,
          address: ledger.address,
          subscriptions: this.mapSubs(subs),
        };
      });

    // ponytail: in-memory merge OK for farm-scale lists; paginate after merge
    const merged = [...connectedRows, ...managedRows].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const total = merged.length;
    const start = (query.page - 1) * query.limit;
    const data = merged.slice(start, start + query.limit);

    return {
      data,
      meta: buildPageMeta(query.page, query.limit, total),
    };
  }

  /**
   * Farm adds a customer who has no app account: ledger row + active
   * subscription. Cancels matching pending invites for the same mobile.
   */
  async createManagedCustomer(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: CreateManagedCustomerDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    await this.farmsService.getActiveFarmOrFail(farmId);
    const farmOwnerUserId =
      await this.farmsService.getFarmOwnerUserId(farmId);

    const mobileNumber = dto.mobileNumber
      ? normalizeMobileNumber(dto.mobileNumber)
      : null;
    if (mobileNumber) {
      const existing = await this.customersRepo.findOne({
        where: { supplierId: farmOwnerUserId, mobileNumber },
      });
      if (existing) {
        throw new ConflictException(
          'Customer with this mobile already exists for this farm',
        );
      }
    }

    const startDate = resolveEffectiveStartDate(dto.startDate, todayIso());
    const scheduleType =
      dto.scheduleType ?? SubscriptionScheduleType.EVERY_DAY;
    const deliveryDays =
      scheduleType === SubscriptionScheduleType.WEEKLY
        ? [weekdayFromIsoDate(startDate)]
        : null;

    return this.dataSource.transaction(async (manager) => {
      const ledgerCustomer = await manager.save(
        manager.create(Customer, {
          supplierId: farmOwnerUserId,
          customerUserId: null,
          name: dto.name.trim(),
          mobileNumber,
          address: dto.address?.trim() || null,
          notes: dto.notes?.trim() || null,
          status: CustomerStatus.ACTIVE,
          version: 1,
        }),
      );
      await manager.save(
        manager.create(ChangeLog, {
          supplierId: farmOwnerUserId,
          entityType: 'CUSTOMER',
          entityId: ledgerCustomer.id,
          changeType: 'CREATE',
          entityVersion: 1,
        }),
      );

      const subscription = await manager.save(
        manager.create(MilkSubscription, {
          supplierId: farmOwnerUserId,
          farmId,
          customerId: ledgerCustomer.id,
          milkType: dto.milkType,
          defaultQuantity: dto.quantity,
          ratePerLitre: dto.ratePerLitre,
          deliveryShift: dto.deliveryShift,
          scheduleType,
          deliveryDays,
          startDate,
          assignedDeliveryUserId: null,
          status: SubscriptionStatus.ACTIVE,
          version: 1,
        }),
      );
      await manager.save(
        manager.create(ChangeLog, {
          supplierId: farmOwnerUserId,
          entityType: 'SUBSCRIPTION',
          entityId: subscription.id,
          changeType: 'CREATE',
          entityVersion: 1,
        }),
      );

      if (mobileNumber) {
        await manager.update(
          FarmCustomerInvitation,
          {
            farmId,
            mobileNumber,
            status: InvitationStatus.PENDING,
          },
          { status: InvitationStatus.CANCELLED },
        );
      }

      return {
        source: 'MANAGED' as const,
        ledgerCustomerId: ledgerCustomer.id,
        customer: ledgerCustomer,
        subscription,
      };
    });
  }

  async getCustomer(
    user: { id: string; role: UserRole },
    farmId: string,
    customerUserId: string,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const connection = assertFound(
      await this.connectionsRepo.findOne({
        where: { farmId, customerUserId },
        relations: ['customerUser'],
      }),
      'Connection not found',
    );
    return connection;
  }

  async isBlocked(farmId: string, customerUserId: string): Promise<boolean> {
    const connection = await this.connectionsRepo.findOne({
      where: { farmId, customerUserId },
    });
    return connection?.status === ConnectionStatus.BLOCKED;
  }

  /**
   * Internal, unauthenticated lookup (no ownership assertion) for use by
   * other services that have already validated the caller's identity, e.g.
   * a customer checking their own connection status with a farm.
   */
  async getConnectionStatus(
    farmId: string,
    customerUserId: string,
  ): Promise<ConnectionStatus | null> {
    const connection = await this.connectionsRepo.findOne({
      where: { farmId, customerUserId },
    });
    return connection?.status ?? null;
  }

  /**
   * Atomically activates (or creates) a farm-customer connection, finds or
   * creates the legacy ledger `Customer` row for the farm owner, and creates
   * an active `MilkSubscription`. Must be called within an existing
   * transaction's EntityManager so it participates in the caller's atomic
   * accept flow (service-request accept, invitation accept).
   */
  async acceptIntoSubscription(
    manager: EntityManager,
    params: AcceptIntoSubscriptionParams,
  ): Promise<{
    connection: FarmCustomerConnection;
    subscription: MilkSubscription;
  }> {
    let connection = await manager.findOne(FarmCustomerConnection, {
      where: { farmId: params.farmId, customerUserId: params.customerUserId },
    });
    if (!connection) {
      connection = manager.create(FarmCustomerConnection, {
        farmId: params.farmId,
        customerUserId: params.customerUserId,
      });
    }
    connection.status = ConnectionStatus.ACTIVE;
    connection.connectedAt = new Date();
    connection = await manager.save(connection);

    let ledgerCustomer = await manager.findOne(Customer, {
      where: {
        supplierId: params.farmOwnerUserId,
        customerUserId: params.customerUserId,
      },
    });
    if (!ledgerCustomer) {
      ledgerCustomer = await manager.save(
        manager.create(Customer, {
          supplierId: params.farmOwnerUserId,
          customerUserId: params.customerUserId,
          name: params.customerName,
          mobileNumber: params.mobileNumber,
          status: CustomerStatus.ACTIVE,
          version: 1,
        }),
      );
      await manager.save(
        manager.create(ChangeLog, {
          supplierId: params.farmOwnerUserId,
          entityType: 'CUSTOMER',
          entityId: ledgerCustomer.id,
          changeType: 'CREATE',
          entityVersion: 1,
        }),
      );
    }

    const scheduleType =
      params.scheduleType ?? SubscriptionScheduleType.EVERY_DAY;
    const deliveryDays =
      scheduleType === SubscriptionScheduleType.WEEKLY
        ? (params.deliveryDays ?? [weekdayFromIsoDate(params.startDate)])
        : (params.deliveryDays ?? null);

    const subscription = await manager.save(
      manager.create(MilkSubscription, {
        supplierId: params.farmOwnerUserId,
        farmId: params.farmId,
        customerId: ledgerCustomer.id,
        farmProductId: params.farmProductId ?? null,
        milkType: params.milkType,
        defaultQuantity: params.quantity,
        ratePerLitre: params.ratePerLitre,
        deliveryShift: params.deliveryShift,
        scheduleType,
        deliveryDays,
        startDate: params.startDate,
        assignedDeliveryUserId: params.assignedDeliveryUserId ?? null,
        status: SubscriptionStatus.ACTIVE,
        version: 1,
      }),
    );
    await manager.save(
      manager.create(ChangeLog, {
        supplierId: params.farmOwnerUserId,
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        changeType: 'CREATE',
        entityVersion: 1,
      }),
    );

    return { connection, subscription };
  }
}

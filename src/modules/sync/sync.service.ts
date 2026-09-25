import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThan, Repository } from 'typeorm';
import { UserRole } from '../../common/enums';
import { evaluateSyncOperation } from '../../common/utils/sync.util';
import { getSupplierIdOrThrow } from '../../common/utils/ownership.util';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { Payment } from '../payments/entities/payment.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { ChangeLog } from './entities/change-log.entity';
import { SyncOperation } from './entities/sync-operation.entity';
import { SyncPushDto, SyncPushOperationDto } from './dto/sync.dto';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(SyncOperation)
    private readonly syncOpsRepo: Repository<SyncOperation>,
    @InjectRepository(ChangeLog)
    private readonly changeLogRepo: Repository<ChangeLog>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(MilkSubscription)
    private readonly subsRepo: Repository<MilkSubscription>,
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async push(user: { id: string; role: UserRole }, dto: SyncPushDto) {
    const operationIds = dto.operations.map((op) => op.operationId);
    const duplicateOperationIds = operationIds.length
      ? new Set(
          (
            await this.syncOpsRepo.find({
              where: { operationId: In(operationIds) },
              select: ['operationId'],
            })
          ).map((o) => o.operationId),
        )
      : new Set<string>();
    // Mutable cache seeded with a batched pre-fetch: avoids a per-operation
    // findOne, and is kept fresh as operations apply so a later op touching
    // the same entity within this batch still sees the prior op's write.
    const entityCache = await this.preloadEntities(dto.operations);

    const results = [];
    for (const op of dto.operations) {
      results.push(
        await this.processOperation(
          user,
          op,
          duplicateOperationIds,
          entityCache,
        ),
      );
    }
    return { results };
  }

  async pull(user: { id: string; role: UserRole }, cursor: number) {
    const supplierId = getSupplierIdOrThrow(user);
    const changes = await this.changeLogRepo.find({
      where: {
        supplierId,
        id: MoreThan(String(cursor)),
      },
      order: { id: 'ASC' },
      take: 100,
    });

    const entityCache = await this.preloadEntities(changes);
    const entities = changes.map((change) => ({
      changeId: change.id,
      entityType: change.entityType,
      entityId: change.entityId,
      changeType: change.changeType,
      entityVersion: change.entityVersion,
      changedAt: change.changedAt,
      entity:
        entityCache.get(this.entityKey(change.entityType, change.entityId)) ??
        null,
    }));

    const nextCursor =
      changes.length > 0 ? changes[changes.length - 1].id : String(cursor);

    return {
      changes: entities,
      cursor: nextCursor,
      hasMore: changes.length === 100,
    };
  }

  private async processOperation(
    user: { id: string; role: UserRole },
    op: SyncPushOperationDto,
    duplicateOperationIds: Set<string>,
    entityCache: Map<string, any>,
  ) {
    const key = this.entityKey(op.entityType, op.entityId);
    if (duplicateOperationIds.has(op.operationId)) {
      const entity = entityCache.get(key) ?? null;
      return {
        operationId: op.operationId,
        entityId: op.entityId,
        status: 'DUPLICATE',
        serverVersion: this.readVersion(entity),
        errorCode: null,
        entity,
      };
    }

    const current = entityCache.get(key) ?? null;
    const decision = evaluateSyncOperation({
      operationId: op.operationId,
      alreadyProcessed: false,
      baseVersion: op.baseVersion,
      serverVersion: this.readVersion(current),
      operationType: op.operationType,
    });

    if (decision.status !== 'APPLIED') {
      await this.recordOp(
        user.id,
        op,
        decision.status,
        decision.reason || null,
      );
      return {
        operationId: op.operationId,
        entityId: op.entityId,
        status: decision.status,
        serverVersion: this.readVersion(current),
        errorCode: decision.reason || decision.status,
        entity: current,
      };
    }

    try {
      const saved = await this.applyOperation(user, op, current);
      entityCache.set(key, saved);
      await this.recordOp(user.id, op, 'APPLIED', null);
      return {
        operationId: op.operationId,
        entityId: op.entityId,
        status: 'APPLIED',
        serverVersion: this.readVersion(saved),
        errorCode: null,
        entity: saved,
      };
    } catch (err: any) {
      await this.recordOp(user.id, op, 'REJECTED', err?.message || 'REJECTED');
      return {
        operationId: op.operationId,
        entityId: op.entityId,
        status: 'REJECTED',
        serverVersion: this.readVersion(current),
        errorCode: err?.message || 'REJECTED',
        entity: current,
      };
    }
  }

  private async applyOperation(
    user: { id: string; role: UserRole },
    op: SyncPushOperationDto,
    current: any,
  ) {
    const supplierId = getSupplierIdOrThrow(user);
    return this.dataSource.transaction(async (manager) => {
      let saved: any;
      if (op.entityType === 'CUSTOMER') {
        if (op.operationType === 'DELETE' && current) {
          current.version += 1;
          await manager.save(Customer, current);
          await manager.softRemove(Customer, current);
          saved = current;
        } else if (op.operationType === 'CREATE') {
          saved = await manager.save(
            manager.create(Customer, {
              id: op.entityId,
              supplierId,
              name: String(op.payload.name || ''),
              mobileNumber: (op.payload.mobileNumber as string) || null,
              address: (op.payload.address as string) || null,
              notes: (op.payload.notes as string) || null,
              version: 1,
            }),
          );
        } else if (current) {
          Object.assign(current, op.payload);
          current.version = op.baseVersion + 1;
          saved = await manager.save(Customer, current);
        }
      } else if (op.entityType === 'SUBSCRIPTION') {
        if (op.operationType === 'DELETE' && current) {
          current.version += 1;
          await manager.save(MilkSubscription, current);
          await manager.softRemove(MilkSubscription, current);
          saved = current;
        } else if (op.operationType === 'CREATE') {
          saved = await manager.save(
            manager.create(MilkSubscription, {
              id: op.entityId,
              supplierId,
              customerId: String(op.payload.customerId),
              milkType: op.payload.milkType as any,
              defaultQuantity: String(op.payload.defaultQuantity),
              ratePerLitre: String(op.payload.ratePerLitre),
              deliveryShift: op.payload.deliveryShift as any,
              startDate: String(op.payload.startDate),
              endDate: (op.payload.endDate as string) || null,
              version: 1,
            }),
          );
        } else if (current) {
          Object.assign(current, op.payload);
          current.version = op.baseVersion + 1;
          saved = await manager.save(MilkSubscription, current);
        }
      } else if (op.entityType === 'DELIVERY') {
        if (op.operationType === 'DELETE' && current) {
          current.version += 1;
          await manager.save(MilkDelivery, current);
          await manager.softRemove(MilkDelivery, current);
          saved = current;
        } else if (op.operationType === 'CREATE') {
          saved = await manager.save(
            manager.create(MilkDelivery, {
              id: op.entityId,
              supplierId,
              customerId: String(op.payload.customerId),
              subscriptionId: String(op.payload.subscriptionId),
              deliveryDate: String(op.payload.deliveryDate),
              deliveryShift: op.payload.deliveryShift as any,
              quantity: String(op.payload.quantity),
              ratePerLitre: String(op.payload.ratePerLitre),
              amount: String(op.payload.amount),
              status: op.payload.status as any,
              clientReferenceId:
                (op.payload.clientReferenceId as string) || op.entityId,
              version: 1,
              createdByUserId: user.id,
            }),
          );
        } else if (current) {
          Object.assign(current, {
            quantity: op.payload.quantity ?? current.quantity,
            status: op.payload.status ?? current.status,
            notes: op.payload.notes ?? current.notes,
            amount: op.payload.amount ?? current.amount,
          });
          current.version = op.baseVersion + 1;
          saved = await manager.save(MilkDelivery, current);
        }
      } else if (op.entityType === 'PAYMENT') {
        if (op.operationType === 'DELETE' && current) {
          current.version += 1;
          await manager.save(Payment, current);
          await manager.softRemove(Payment, current);
          saved = current;
        } else if (op.operationType === 'CREATE') {
          saved = await manager.save(
            manager.create(Payment, {
              id: op.entityId,
              supplierId,
              customerId: String(op.payload.customerId),
              billId: (op.payload.billId as string) || null,
              amount: String(op.payload.amount),
              paymentMethod: op.payload.paymentMethod as any,
              paymentDate: String(op.payload.paymentDate),
              clientReferenceId:
                (op.payload.clientReferenceId as string) || op.entityId,
              version: 1,
              recordedByUserId: user.id,
            }),
          );
        } else if (current) {
          Object.assign(current, op.payload);
          current.version = op.baseVersion + 1;
          saved = await manager.save(Payment, current);
        }
      }

      if (saved) {
        await manager.save(
          manager.create(ChangeLog, {
            supplierId,
            entityType: op.entityType,
            entityId: op.entityId,
            changeType: op.operationType,
            entityVersion: this.readVersion(saved) || 1,
          }),
        );
      }
      return saved;
    });
  }

  private entityKey(entityType: string, entityId: string) {
    return `${entityType}:${entityId}`;
  }

  /** Batches the per-entityType lookups for a set of {entityType, entityId}
   * items (sync operations or change-log rows) into one query per type,
   * instead of a findOne per item. */
  private async preloadEntities(
    items: { entityType: string; entityId: string }[],
  ): Promise<Map<string, any>> {
    const idsByType: Record<string, Set<string>> = {
      CUSTOMER: new Set(),
      SUBSCRIPTION: new Set(),
      DELIVERY: new Set(),
      PAYMENT: new Set(),
    };
    for (const item of items) {
      idsByType[item.entityType]?.add(item.entityId);
    }

    const map = new Map<string, any>();
    const loaders: Array<[string, Repository<any>, Set<string>]> = [
      ['CUSTOMER', this.customersRepo, idsByType.CUSTOMER],
      ['SUBSCRIPTION', this.subsRepo, idsByType.SUBSCRIPTION],
      ['DELIVERY', this.deliveriesRepo, idsByType.DELIVERY],
      ['PAYMENT', this.paymentsRepo, idsByType.PAYMENT],
    ];
    await Promise.all(
      loaders.map(async ([entityType, repo, ids]) => {
        if (!ids.size) return;
        const rows = await repo.find({ where: { id: In([...ids]) } });
        for (const row of rows) {
          map.set(this.entityKey(entityType, row.id), row);
        }
      }),
    );
    return map;
  }

  private readVersion(entity: any): number | null {
    if (!entity) return null;
    return typeof entity.version === 'number' ? entity.version : null;
  }

  private async recordOp(
    userId: string,
    op: SyncPushOperationDto,
    status: string,
    errorCode: string | null,
  ) {
    await this.syncOpsRepo.save(
      this.syncOpsRepo.create({
        operationId: op.operationId,
        userId,
        deviceId: op.deviceId,
        entityType: op.entityType,
        entityId: op.entityId,
        operationType: op.operationType,
        resultStatus: status,
        processedAt: new Date(),
        errorCode,
      }),
    );
  }
}

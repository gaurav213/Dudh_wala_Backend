import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
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
    const results = [];
    for (const op of dto.operations) {
      results.push(await this.processOperation(user, op));
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

    const entities = [];
    for (const change of changes) {
      const entity = await this.loadEntity(change.entityType, change.entityId);
      entities.push({
        changeId: change.id,
        entityType: change.entityType,
        entityId: change.entityId,
        changeType: change.changeType,
        entityVersion: change.entityVersion,
        changedAt: change.changedAt,
        entity,
      });
    }

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
  ) {
    const existingOp = await this.syncOpsRepo.findOne({
      where: { operationId: op.operationId },
    });
    if (existingOp) {
      const entity = await this.loadEntity(op.entityType, op.entityId);
      return {
        operationId: op.operationId,
        entityId: op.entityId,
        status: 'DUPLICATE',
        serverVersion: this.readVersion(entity),
        errorCode: null,
        entity,
      };
    }

    const current = await this.loadEntity(op.entityType, op.entityId);
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

  private async loadEntity(entityType: string, entityId: string) {
    switch (entityType) {
      case 'CUSTOMER':
        return this.customersRepo.findOne({ where: { id: entityId } });
      case 'SUBSCRIPTION':
        return this.subsRepo.findOne({ where: { id: entityId } });
      case 'DELIVERY':
        return this.deliveriesRepo.findOne({ where: { id: entityId } });
      case 'PAYMENT':
        return this.paymentsRepo.findOne({ where: { id: entityId } });
      default:
        return null;
    }
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

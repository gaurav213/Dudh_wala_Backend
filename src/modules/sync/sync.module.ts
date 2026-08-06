import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { Payment } from '../payments/entities/payment.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { ChangeLog } from './entities/change-log.entity';
import { SyncOperation } from './entities/sync-operation.entity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SyncOperation,
      ChangeLog,
      Customer,
      MilkSubscription,
      MilkDelivery,
      Payment,
    ]),
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService, TypeOrmModule],
})
export class SyncModule {}

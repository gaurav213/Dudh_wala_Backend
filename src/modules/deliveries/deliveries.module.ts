import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { ChangeLog } from '../sync/entities/change-log.entity';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { MilkDelivery } from './entities/milk-delivery.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MilkDelivery, MilkSubscription, ChangeLog]),
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService, TypeOrmModule],
})
export class DeliveriesModule {}

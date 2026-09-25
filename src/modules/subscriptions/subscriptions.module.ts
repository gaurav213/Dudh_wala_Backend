import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersModule } from '../customers/customers.module';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { DeliveryAssignment } from '../farms/entities/delivery-assignment.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { Farm } from '../farms/entities/farm.entity';
import { ChangeLog } from '../sync/entities/change-log.entity';
import { MilkSubscription } from './entities/milk-subscription.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MilkSubscription,
      ChangeLog,
      Farm,
      FarmMember,
      DeliveryAssignment,
      MilkDelivery,
    ]),
    CustomersModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService, TypeOrmModule],
})
export class SubscriptionsModule {}

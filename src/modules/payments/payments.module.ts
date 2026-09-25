import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { Customer } from '../customers/entities/customer.entity';
import { CustomersModule } from '../customers/customers.module';
import { FarmDeliverySettings } from '../farms/entities/farm-delivery-settings.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { ChangeLog } from '../sync/entities/change-log.entity';
import { Payment } from './entities/payment.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      ChangeLog,
      FarmDeliverySettings,
      FarmMember,
      MilkSubscription,
      Customer,
    ]),
    CustomersModule,
    BillingModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService, TypeOrmModule],
})
export class PaymentsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAddress } from '../customer-addresses/entities/customer-address.entity';
import { Customer } from '../customers/entities/customer.entity';
import { DeliveryExtraRequest } from '../deliveries/entities/delivery-extra-request.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { DeliveryAssignment } from '../farms/entities/delivery-assignment.entity';
import { FarmDeliverySettings } from '../farms/entities/farm-delivery-settings.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { Farm } from '../farms/entities/farm.entity';
import { NotificationRecipient } from '../notifications/entities/notification-recipient.entity';
import { Payment } from '../payments/entities/payment.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { DeliveryStaffController } from './delivery-staff.controller';
import { DeliveryStaffService } from './delivery-staff.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MilkDelivery,
      MilkSubscription,
      Customer,
      CustomerAddress,
      DeliveryAssignment,
      FarmMember,
      Farm,
      FarmDeliverySettings,
      DeliveryExtraRequest,
      Payment,
      NotificationRecipient,
    ]),
  ],
  controllers: [DeliveryStaffController],
  providers: [DeliveryStaffService],
  exports: [DeliveryStaffService],
})
export class DeliveryStaffModule {}

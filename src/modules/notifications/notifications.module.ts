import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { Payment } from '../payments/entities/payment.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { User } from '../users/entities/user.entity';
import { DeviceToken } from './entities/device-token.entity';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { AppNotification } from './entities/notification.entity';
import { FcmPushProvider } from './fcm/fcm-push.provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppNotification,
      NotificationRecipient,
      DeviceToken,
      Payment,
      Customer,
      MilkDelivery,
      FarmMember,
      MilkSubscription,
      User,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, FcmPushProvider],
  exports: [NotificationsService, TypeOrmModule],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { MonthlyBillItem } from '../billing/entities/monthly-bill-item.entity';
import { CustomerAddress } from '../customer-addresses/entities/customer-address.entity';
import { DeliveryAssignment } from '../farms/entities/delivery-assignment.entity';
import { FarmDeliverySettings } from '../farms/entities/farm-delivery-settings.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { Farm } from '../farms/entities/farm.entity';
import { FarmMilkProduct } from '../farms/entities/farm-milk-product.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { ChangeLog } from '../sync/entities/change-log.entity';
import { User } from '../users/entities/user.entity';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { DailyListSchedulerService } from './daily-list-scheduler.service';
import { DeliveryExtraRequestsService } from './delivery-extra-requests.service';
import { DeliveryOpsController } from './delivery-ops.controller';
import { DeliveryOpsService } from './delivery-ops.service';
import { DeliveryEditHistory } from './entities/delivery-edit-history.entity';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { DeliveryExtraRequest } from './entities/delivery-extra-request.entity';
import { DeliveryIssue } from './entities/delivery-issue.entity';
import { MilkDelivery } from './entities/milk-delivery.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MilkDelivery,
      MilkSubscription,
      ChangeLog,
      DeliveryAssignment,
      DeliveryEvent,
      DeliveryEditHistory,
      DeliveryExtraRequest,
      DeliveryIssue,
      Farm,
      FarmDeliverySettings,
      FarmMember,
      FarmMilkProduct,
      CustomerAddress,
      MonthlyBillItem,
      User,
    ]),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [DeliveriesController, DeliveryOpsController],
  providers: [
    DeliveriesService,
    DeliveryOpsService,
    DeliveryExtraRequestsService,
    DailyListSchedulerService,
  ],
  exports: [
    DeliveriesService,
    DeliveryOpsService,
    DeliveryExtraRequestsService,
    TypeOrmModule,
  ],
})
export class DeliveriesModule {}

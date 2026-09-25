import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectionsModule } from '../connections/connections.module';
import { CustomerAddress } from '../customer-addresses/entities/customer-address.entity';
import { Customer } from '../customers/entities/customer.entity';
import { FarmMilkProduct } from '../farms/entities/farm-milk-product.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { FarmServiceArea } from '../farms/entities/farm-service-area.entity';
import { Farm } from '../farms/entities/farm.entity';
import { FarmsModule } from '../farms/farms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomerReview } from '../reviews/entities/customer-review.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { User } from '../users/entities/user.entity';
import { CustomerServiceRequest } from './entities/customer-service-request.entity';
import { FarmServiceRequestsController } from './farm-service-requests.controller';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerServiceRequest,
      CustomerAddress,
      FarmMilkProduct,
      FarmServiceArea,
      FarmMember,
      Farm,
      User,
      CustomerReview,
      MilkSubscription,
      Customer,
    ]),
    FarmsModule,
    ConnectionsModule,
    SubscriptionsModule,
    NotificationsModule,
  ],
  controllers: [ServiceRequestsController, FarmServiceRequestsController],
  providers: [ServiceRequestsService],
  exports: [ServiceRequestsService, TypeOrmModule],
})
export class ServiceRequestsModule {}

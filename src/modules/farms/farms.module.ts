import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminFarmsController } from './admin-farms.controller';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { FarmCustomerConnection } from '../connections/entities/farm-customer-connection.entity';
import { Customer } from '../customers/entities/customer.entity';
import { FarmCustomerInvitation } from '../customer-invitations/entities/farm-customer-invitation.entity';
import { CustomerAddress } from '../customer-addresses/entities/customer-address.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomerServiceRequest } from '../service-requests/entities/customer-service-request.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { DeliveryAssignment } from './entities/delivery-assignment.entity';
import { FarmMedia } from './entities/farm-media.entity';
import { FarmMemberInvitation } from './entities/farm-member-invitation.entity';
import { FarmMilkProduct } from './entities/farm-milk-product.entity';
import { FarmMember } from './entities/farm-member.entity';
import { FarmReview } from './entities/farm-review.entity';
import { FarmServiceArea } from './entities/farm-service-area.entity';
import { Farm } from './entities/farm.entity';
import { MilkRateHistory } from './entities/milk-rate-history.entity';
import { FarmDashboardService } from './farm-dashboard.service';
import { FarmProductsController } from './farm-products.controller';
import { FarmProductsService } from './farm-products.service';
import { FarmServiceAreasController } from './farm-service-areas.controller';
import { FarmServiceAreasService } from './farm-service-areas.service';
import { DeliveryEditHistory } from '../deliveries/entities/delivery-edit-history.entity';
import { Payment } from '../payments/entities/payment.entity';
import { FarmStaffController } from './farm-staff.controller';
import { FarmStaffDetailService } from './farm-staff-detail.service';
import { FarmStaffService } from './farm-staff.service';
import { FarmsController } from './farms.controller';
import { FarmsSearchController } from './farms-search.controller';
import { FarmsSearchService } from './farms-search.service';
import { FarmsService } from './farms.service';

@Module({
  imports: [
    NotificationsModule,
    TypeOrmModule.forFeature([
      Farm,
      FarmMember,
      FarmServiceArea,
      FarmMilkProduct,
      FarmMedia,
      FarmReview,
      MilkRateHistory,
      FarmMemberInvitation,
      DeliveryAssignment,
      // Registered here (read-only cross-module usage) for dashboard stats
      // and soft-close safety checks without introducing module cycles.
      FarmCustomerConnection,
      CustomerServiceRequest,
      FarmCustomerInvitation,
      MilkDelivery,
      MonthlyBill,
      CustomerAddress,
      DeliveryEditHistory,
      Payment,
      Customer,
      MilkSubscription,
    ]),
  ],
  controllers: [
    // FarmsSearchController must be registered before FarmsController so
    // "/farms/search" resolves before the "/farms/:id" wildcard route.
    FarmsSearchController,
    FarmsController,
    AdminFarmsController,
    FarmServiceAreasController,
    FarmProductsController,
    FarmStaffController,
  ],
  providers: [
    FarmsService,
    FarmServiceAreasService,
    FarmProductsService,
    FarmsSearchService,
    FarmDashboardService,
    FarmStaffService,
    FarmStaffDetailService,
  ],
  exports: [FarmsService, TypeOrmModule],
})
export class FarmsModule {}

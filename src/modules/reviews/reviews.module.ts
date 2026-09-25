import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmCustomerConnection } from '../connections/entities/farm-customer-connection.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomerReview } from './entities/customer-review.entity';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerReview,
      MilkDelivery,
      FarmMember,
      FarmCustomerConnection,
    ]),
    NotificationsModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

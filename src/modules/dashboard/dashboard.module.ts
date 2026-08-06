import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MilkDelivery,
      MonthlyBill,
      Payment,
      Customer,
      User,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

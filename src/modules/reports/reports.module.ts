import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([MilkDelivery, MonthlyBill, Payment])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

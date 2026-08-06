import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersModule } from '../customers/customers.module';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { MonthlyBillItem } from './entities/monthly-bill-item.entity';
import { MonthlyBill } from './entities/monthly-bill.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonthlyBill, MonthlyBillItem, MilkDelivery]),
    CustomersModule,
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService, TypeOrmModule],
})
export class BillingModule {}

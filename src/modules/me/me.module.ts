import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { FarmMilkProduct } from '../farms/entities/farm-milk-product.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentsModule } from '../payments/payments.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      MonthlyBill,
      Payment,
      MilkDelivery,
      FarmMilkProduct,
    ]),
    PaymentsModule,
  ],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}

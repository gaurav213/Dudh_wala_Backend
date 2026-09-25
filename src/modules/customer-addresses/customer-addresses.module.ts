import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { DeliveryAssignment } from '../farms/entities/delivery-assignment.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { CustomerAddressesController } from './customer-addresses.controller';
import { CustomerAddressesService } from './customer-addresses.service';
import { CustomerAddress } from './entities/customer-address.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerAddress,
      Customer,
      MilkSubscription,
      DeliveryAssignment,
    ]),
  ],
  controllers: [CustomerAddressesController],
  providers: [CustomerAddressesService],
  exports: [CustomerAddressesService],
})
export class CustomerAddressesModule {}

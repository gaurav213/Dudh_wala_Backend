import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectionsModule } from '../connections/connections.module';
import { FarmMilkProduct } from '../farms/entities/farm-milk-product.entity';
import { Farm } from '../farms/entities/farm.entity';
import { FarmsModule } from '../farms/farms.module';
import { CustomerInvitationsController } from './customer-invitations.controller';
import { CustomerInvitationsService } from './customer-invitations.service';
import { FarmCustomerInvitation } from './entities/farm-customer-invitation.entity';
import { FarmCustomerInvitationsController } from './farm-customer-invitations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FarmCustomerInvitation, Farm, FarmMilkProduct]),
    FarmsModule,
    ConnectionsModule,
  ],
  controllers: [
    CustomerInvitationsController,
    FarmCustomerInvitationsController,
  ],
  providers: [CustomerInvitationsService],
  exports: [CustomerInvitationsService, TypeOrmModule],
})
export class CustomerInvitationsModule {}

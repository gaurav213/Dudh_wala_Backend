import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersModule } from '../customers/customers.module';
import { FarmCustomerInvitation } from '../customer-invitations/entities/farm-customer-invitation.entity';
import { FarmsModule } from '../farms/farms.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { User } from '../users/entities/user.entity';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { FarmCustomerConnection } from './entities/farm-customer-connection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FarmCustomerConnection,
      User,
      FarmCustomerInvitation,
    ]),
    FarmsModule,
    CustomersModule,
    SubscriptionsModule,
  ],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService, TypeOrmModule],
})
export class ConnectionsModule {}

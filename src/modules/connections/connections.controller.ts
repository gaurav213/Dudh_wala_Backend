import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ConnectionsService } from './connections.service';
import { ListConnectionsDto } from './dto/connection.dto';
import { CreateManagedCustomerDto } from './dto/managed-customer.dto';

@ApiTags('connections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
@Controller('farms/:farmId/customers')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  listCustomers(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Query() query: ListConnectionsDto,
  ) {
    return this.connectionsService.listCustomers(user, farmId, query);
  }

  @Post('managed')
  createManaged(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: CreateManagedCustomerDto,
  ) {
    return this.connectionsService.createManagedCustomer(user, farmId, dto);
  }

  @Get(':customerUserId')
  getCustomer(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('customerUserId', ParseUUIDPipe) customerUserId: string,
  ) {
    return this.connectionsService.getCustomer(user, farmId, customerUserId);
  }
}

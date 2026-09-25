import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CustomerAddressesService } from './customer-addresses.service';
import {
  CreateCustomerAddressDto,
  UpdateAddressLocationDto,
  UpdateCustomerAddressDto,
} from './dto/customer-address.dto';

@ApiTags('customer-addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customer-addresses')
export class CustomerAddressesController {
  constructor(
    private readonly customerAddressesService: CustomerAddressesService,
  ) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    return this.customerAddressesService.create(userId, dto);
  }

  @Get()
  @Roles(UserRole.CUSTOMER)
  findAll(@CurrentUser('id') userId: string) {
    return this.customerAddressesService.findAll(userId);
  }

  @Patch(':id')
  @Roles(UserRole.CUSTOMER)
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    return this.customerAddressesService.update(userId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.CUSTOMER)
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerAddressesService.remove(userId, id);
  }

  @Post(':id/set-default')
  @Roles(UserRole.CUSTOMER)
  setDefault(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerAddressesService.setDefault(userId, id);
  }

  @Patch(':id/location')
  @Roles(
    UserRole.CUSTOMER,
    UserRole.FARM_OWNER,
    UserRole.DELIVERY_STAFF,
    UserRole.PLATFORM_OWNER,
  )
  updateLocation(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressLocationDto,
  ) {
    return this.customerAddressesService.updateLocation(user, id, dto);
  }

  @Post(':id/confirm-location')
  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  confirmLocation(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerAddressesService.confirmLocation(user, id);
  }

  @Post(':id/reset-verification')
  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  resetVerification(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerAddressesService.resetVerification(user, id);
  }
}

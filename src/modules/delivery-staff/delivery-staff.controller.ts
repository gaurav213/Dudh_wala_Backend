import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdateFarmDeliverySettingsDto } from '../farms/dto/farm-delivery-settings.dto';
import { DeliveryStaffService } from './delivery-staff.service';

@ApiTags('delivery-staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DELIVERY_STAFF, UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
@Controller()
export class DeliveryStaffController {
  constructor(private readonly staffService: DeliveryStaffService) {}

  @Get('delivery-staff/dashboard')
  dashboard(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.staffService.dashboard(user);
  }

  @Get('delivery-staff/pending-cash')
  pendingCash(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.staffService.pendingCash(user);
  }

  @Get('delivery-staff/route/today')
  routeToday(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('farmId') farmId?: string,
    @Query('shift') shift?: string,
    @Query('includeCompleted') includeCompleted?: string,
  ) {
    return this.staffService.routeToday(user, {
      latitude,
      longitude,
      farmId,
      shift,
      includeCompleted,
    });
  }

  @Get('delivery-staff/customers')
  customers(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.staffService.customers(user);
  }

  @Get('delivery-staff/customers/:customerId')
  customerDetail(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.staffService.customerDetail(user, customerId);
  }

  @Get('delivery-assignments/my')
  myAssignments(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.staffService.myAssignments(user);
  }

  @Get('farms/:farmId/customers/:customerId/billing-summary')
  farmBillingSummary(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.staffService.billingSummary(user, customerId, farmId);
  }

  @Get('customers/:customerId/billing-summary')
  billingSummary(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.staffService.billingSummary(user, customerId);
  }

  @Get('farms/:farmId/delivery-settings')
  getDeliverySettings(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
  ) {
    return this.staffService.getDeliverySettings(user, farmId);
  }

  @Patch('farms/:farmId/delivery-settings')
  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  updateDeliverySettings(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: UpdateFarmDeliverySettingsDto,
  ) {
    return this.staffService.updateDeliverySettings(user, farmId, dto);
  }
}

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
import { InviteFarmStaffDto } from './dto/farm-staff.dto';
import { FarmStaffDetailService } from './farm-staff-detail.service';
import { FarmStaffService } from './farm-staff.service';

@ApiTags('farm-staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
@Controller('farms/:farmId/staff')
export class FarmStaffController {
  constructor(
    private readonly farmStaffService: FarmStaffService,
    private readonly staffDetailService: FarmStaffDetailService,
  ) {}

  /** Alias for members list — matches GET /farms/:farmId/staff */
  @Get()
  listStaff(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
  ) {
    return this.farmStaffService.listMembers(user, farmId);
  }

  @Post('invitations')
  invite(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: InviteFarmStaffDto,
  ) {
    return this.farmStaffService.invite(user, farmId, dto);
  }

  @Get('invitations')
  listInvitations(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
  ) {
    return this.farmStaffService.listInvitations(user, farmId);
  }

  @Post('invitations/:id/resend')
  resend(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmStaffService.resend(user, farmId, id);
  }

  @Post('invitations/:id/cancel')
  cancel(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmStaffService.cancel(user, farmId, id);
  }

  @Get('members')
  listMembers(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
  ) {
    return this.farmStaffService.listMembers(user, farmId);
  }

  @Get(':staffUserId')
  getStaffDetail(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('staffUserId', ParseUUIDPipe) staffUserId: string,
  ) {
    return this.staffDetailService.getStaffDetail(user, farmId, staffUserId);
  }

  @Get(':staffUserId/today')
  staffToday(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('staffUserId', ParseUUIDPipe) staffUserId: string,
    @Query('section') section?: 'all' | 'pending' | 'extra' | 'edited',
  ) {
    return this.staffDetailService.getStaffToday(
      user,
      farmId,
      staffUserId,
      section ?? 'all',
    );
  }

  @Get(':staffUserId/deliveries')
  staffDeliveries(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('staffUserId', ParseUUIDPipe) staffUserId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.staffDetailService.listStaffDeliveries(
      user,
      farmId,
      staffUserId,
      {
        from,
        to,
      },
    );
  }

  @Get(':staffUserId/edited-deliveries')
  staffEdited(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('staffUserId', ParseUUIDPipe) staffUserId: string,
  ) {
    return this.staffDetailService.listEditedDeliveries(
      user,
      farmId,
      staffUserId,
    );
  }

  @Post('members/:memberId/deactivate')
  deactivateMember(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Query('force') force?: string,
  ) {
    return this.staffDetailService.deactivateWithPendingCheck(
      user,
      farmId,
      memberId,
      { force: force === 'true' },
    );
  }

  @Post('members/:memberId/reactivate')
  reactivateMember(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.farmStaffService.reactivateMember(user, farmId, memberId);
  }

  @Post('members/:memberId/remove')
  removeMember(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.farmStaffService.removeMember(user, farmId, memberId);
  }
}

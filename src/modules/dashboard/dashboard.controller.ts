import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(UserRole.FARM_OWNER)
  @Get('supplier/today')
  supplierToday(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.dashboardService.supplierToday(user);
  }

  @Roles(UserRole.FARM_OWNER)
  @Get('supplier/month')
  supplierMonth(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('month') month?: string,
  ) {
    return this.dashboardService.supplierMonth(user, month);
  }

  @Roles(UserRole.PLATFORM_OWNER)
  @Get('admin/summary')
  adminSummary() {
    return this.dashboardService.adminSummary();
  }

  @Roles(UserRole.PLATFORM_OWNER)
  @Get('admin/growth')
  adminGrowth() {
    return this.dashboardService.adminGrowth();
  }

  @Roles(UserRole.PLATFORM_OWNER)
  @Get('admin/revenue')
  adminRevenue() {
    return this.dashboardService.adminRevenue();
  }
}

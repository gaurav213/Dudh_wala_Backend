import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('deliveries')
  deliveries(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.reportsService.deliveriesReport(user, {
      dateFrom,
      dateTo,
      customerId,
    });
  }

  @Get('billing')
  billing(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('billingMonth') billingMonth?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.reportsService.billingReport(user, {
      billingMonth,
      customerId,
    });
  }

  @Get('payments')
  payments(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.reportsService.paymentsReport(user, {
      dateFrom,
      dateTo,
      customerId,
    });
  }

  @Get('outstanding-balances')
  outstanding(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.reportsService.outstandingBalances(user);
  }
}

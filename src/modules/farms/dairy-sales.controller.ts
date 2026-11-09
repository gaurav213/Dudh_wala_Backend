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
import { todayIso } from '../../common/utils/date.util';
import { DairySalesService } from './dairy-sales.service';
import {
  CreateDairyPaymentDto,
  CreateDairySlipDto,
} from './dto/dairy-sales.dto';

@ApiTags('dairy-sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
@Controller('farms/:farmId')
export class DairySalesController {
  constructor(private readonly dairySales: DairySalesService) {}

  @Post('dairy-slips')
  createSlip(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: CreateDairySlipDto,
  ) {
    return this.dairySales.createSlip(user, farmId, dto);
  }

  @Get('dairy-slips')
  listSlips(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Query('month') month?: string,
  ) {
    return this.dairySales.listSlips(
      user,
      farmId,
      month || todayIso().slice(0, 7),
    );
  }

  @Post('dairy-payments')
  createPayment(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: CreateDairyPaymentDto,
  ) {
    return this.dairySales.createPayment(user, farmId, dto);
  }

  @Get('dairy-payments')
  listPayments(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Query('month') month?: string,
  ) {
    return this.dairySales.listPayments(
      user,
      farmId,
      month || todayIso().slice(0, 7),
    );
  }

  @Get('dairy-summary')
  summary(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Query('month') month?: string,
  ) {
    return this.dairySales.summary(
      user,
      farmId,
      month || todayIso().slice(0, 7),
    );
  }
}

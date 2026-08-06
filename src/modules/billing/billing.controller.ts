import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { BillingService } from './billing.service';
import {
  GenerateBillDto,
  ListBillsDto,
  UpdateBillDto,
} from './dto/billing.dto';

@ApiTags('bills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
@Controller('bills')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('generate')
  generate(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: GenerateBillDto,
  ) {
    return this.billingService.generate(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query() query: ListBillsDto,
  ) {
    return this.billingService.findAll(user, query);
  }

  @Get('customer/:customerId')
  findByCustomer(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.billingService.findByCustomer(user, customerId);
  }

  @Get('customer/:customerId/month/:month')
  findByCustomerMonth(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('month') month: string,
  ) {
    return this.billingService.findByCustomerMonth(user, customerId, month);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.billingService.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillDto,
  ) {
    return this.billingService.update(user, id, dto);
  }

  @Post(':id/finalize')
  finalize(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.billingService.finalize(user, id);
  }

  @Post(':id/void')
  void(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.billingService.void(user, id);
  }

  @Get(':id/pdf-data')
  pdfData(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.billingService.pdfData(user, id);
  }
}

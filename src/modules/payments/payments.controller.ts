import {
  Body,
  Controller,
  Delete,
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
import {
  CreatePaymentDto,
  ListPaymentsDto,
  UpdatePaymentDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query() query: ListPaymentsDto,
  ) {
    return this.paymentsService.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.paymentsService.update(user, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.remove(user, id);
  }
}

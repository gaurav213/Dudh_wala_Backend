import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ClaimCashPaymentDto } from '../payments/dto/payment.dto';
import { PaymentsService } from '../payments/payments.service';
import { MeDeliveriesQueryDto } from './dto/me-deliveries-query.dto';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('me')
export class MeController {
  constructor(
    private readonly meService: MeService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('billing-summary')
  billingSummary(@CurrentUser() user: { id: string }) {
    return this.meService.billingSummary(user.id);
  }

  @Get('bills')
  bills(@CurrentUser() user: { id: string }, @Query() query: PaginationDto) {
    return this.meService.listBills(user.id, query);
  }

  @Get('payments')
  payments(@CurrentUser() user: { id: string }, @Query() query: PaginationDto) {
    return this.meService.listPayments(user.id, query);
  }

  @Post('payments/cash-claim')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['amount', 'clientReferenceId', 'proof'],
      properties: {
        amount: { type: 'string' },
        farmId: { type: 'string', format: 'uuid' },
        customerId: { type: 'string', format: 'uuid' },
        paymentDate: { type: 'string', format: 'date' },
        notes: { type: 'string' },
        clientReferenceId: { type: 'string', format: 'uuid' },
        proof: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('proof', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  claimCash(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: ClaimCashPaymentDto,
    @UploadedFile() proof: Express.Multer.File,
  ) {
    return this.paymentsService.claimCash(user, dto, proof);
  }

  @Get('deliveries')
  deliveries(
    @CurrentUser() user: { id: string },
    @Query() query: MeDeliveriesQueryDto,
  ) {
    return this.meService.listDeliveries(user.id, query);
  }
}

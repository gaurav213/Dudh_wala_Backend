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
import { DeliveriesService } from './deliveries.service';
import { DeliveryOpsService } from './delivery-ops.service';
import {
  BulkUpdateDeliveriesDto,
  CreateDeliveryDto,
  DeliveryReportDto,
  GenerateDailyListDto,
  ListDeliveriesDto,
  UpdateDeliveryDto,
} from './dto/delivery.dto';
import { DeliveryStatus } from '../../common/enums';

@ApiTags('deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER, UserRole.DELIVERY_STAFF)
@Controller('deliveries')
export class DeliveriesController {
  constructor(
    private readonly deliveriesService: DeliveriesService,
    private readonly ops: DeliveryOpsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateDeliveryDto,
  ) {
    return this.deliveriesService.create(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query() query: ListDeliveriesDto,
  ) {
    return this.deliveriesService.findAll(user, query);
  }

  @Post('generate-daily-list')
  generateDailyList(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: GenerateDailyListDto,
  ) {
    return this.deliveriesService.generateDailyList(user, dto);
  }

  @Post('bulk-update')
  bulkUpdate(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: BulkUpdateDeliveriesDto,
  ) {
    return this.deliveriesService.bulkUpdate(user, dto);
  }

  /** Must be registered before @Get(':id') so "report" is not parsed as a UUID. */
  @Get('report')
  report(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query() query: DeliveryReportDto,
  ) {
    return this.deliveriesService.report(user, query);
  }

  /** Must be registered before @Get(':id'). */
  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  @Get('edited-today')
  editedToday(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.ops.listEditedToday(user);
  }

  /** Must be registered before @Get(':id'). */
  @Get('today')
  today(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('status') status?: DeliveryStatus,
    @Query('shift') shift?: string,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.deliveriesService.todayForStaff(user, {
      status,
      shift,
      date,
      from,
      to,
    });
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveriesService.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryDto,
  ) {
    return this.deliveriesService.update(user, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveriesService.remove(user, id);
  }
}

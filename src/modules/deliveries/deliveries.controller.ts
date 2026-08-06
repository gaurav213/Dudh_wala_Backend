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
import {
  BulkUpdateDeliveriesDto,
  CreateDeliveryDto,
  GenerateDailyListDto,
  ListDeliveriesDto,
  UpdateDeliveryDto,
} from './dto/delivery.dto';

@ApiTags('deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER, UserRole.DELIVERY_STAFF)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

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

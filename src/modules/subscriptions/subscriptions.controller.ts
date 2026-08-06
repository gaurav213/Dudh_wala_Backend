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
import {
  CreateSubscriptionDto,
  ListSubscriptionsDto,
  UpdateSubscriptionDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptionsService.create(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query() query: ListSubscriptionsDto,
  ) {
    return this.subscriptionsService.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subscriptionsService.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.update(user, id, dto);
  }

  @Post(':id/pause')
  pause(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subscriptionsService.pause(user, id);
  }

  @Post(':id/resume')
  resume(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subscriptionsService.resume(user, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subscriptionsService.cancel(user, id);
  }
}

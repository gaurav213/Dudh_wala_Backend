import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserRole } from '../../common/enums';
import {
  ListNotificationsDto,
  RegisterDeviceTokenDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(
    @CurrentUser('id') userId: string,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notifications.listForUser(userId, query);
  }

  @Get('notifications/unread-count')
  unreadCount(@CurrentUser('id') userId: string) {
    return this.notifications.unreadCount(userId);
  }

  @Get('notifications/:recipientId')
  detail(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
  ) {
    return this.notifications.getDetail(user, recipientId);
  }

  @Post('notifications/:recipientId/read')
  markRead(
    @CurrentUser('id') userId: string,
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
  ) {
    return this.notifications.markRead(userId, recipientId);
  }

  @Post('notifications/read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Post('device-tokens')
  registerDevice(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.notifications.registerDevice(userId, dto);
  }

  @Delete('device-tokens')
  unregisterDevice(
    @CurrentUser('id') userId: string,
    @Body('token') token: string,
  ) {
    return this.notifications.unregisterDevice(userId, token);
  }
}

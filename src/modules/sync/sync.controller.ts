import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SyncPullQueryDto, SyncPushDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  push(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: SyncPushDto,
  ) {
    return this.syncService.push(user, dto);
  }

  @Get('pull')
  pull(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query() query: SyncPullQueryDto,
  ) {
    return this.syncService.pull(user, query.cursor);
  }
}

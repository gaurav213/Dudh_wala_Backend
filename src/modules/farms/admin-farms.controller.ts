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
import { FarmDecisionDto, ListFarmsDto } from '../farms/dto/farm.dto';
import { FarmsService } from '../farms/farms.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PLATFORM_OWNER)
@Controller('admin')
export class AdminFarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Get('farms')
  list(@Query() query: ListFarmsDto) {
    return this.farmsService.listForAdmin(query);
  }

  @Get('farms/:id')
  getOne(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmsService.getFarm(user, id);
  }

  @Post('farms/:id/approve')
  approve(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FarmDecisionDto,
  ) {
    return this.farmsService.approve(user, id, dto);
  }

  @Post('farms/:id/reject')
  reject(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FarmDecisionDto,
  ) {
    return this.farmsService.reject(user, id, dto);
  }

  @Post('farms/:id/suspend')
  suspend(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FarmDecisionDto,
  ) {
    return this.farmsService.suspend(user, id, dto);
  }

  @Post('farms/:id/reactivate')
  reactivate(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FarmDecisionDto,
  ) {
    return this.farmsService.reactivate(user, id, dto);
  }
}

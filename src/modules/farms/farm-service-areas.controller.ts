import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateFarmServiceAreaDto,
  UpdateFarmServiceAreaDto,
} from './dto/farm-service-area.dto';
import { FarmServiceAreasService } from './farm-service-areas.service';

@ApiTags('farm-service-areas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER, UserRole.DELIVERY_STAFF)
@Controller('farms/:farmId/service-areas')
export class FarmServiceAreasController {
  constructor(private readonly serviceAreasService: FarmServiceAreasService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: CreateFarmServiceAreaDto,
  ) {
    return this.serviceAreasService.create(user, farmId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
  ) {
    return this.serviceAreasService.findAll(user, farmId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFarmServiceAreaDto,
  ) {
    return this.serviceAreasService.update(user, farmId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.serviceAreasService.remove(user, farmId, id);
  }
}

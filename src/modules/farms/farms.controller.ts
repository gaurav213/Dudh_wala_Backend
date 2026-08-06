import {
  Body,
  Controller,
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
import { CreateFarmDto, UpdateFarmDto } from './dto/farm.dto';
import { FarmsService } from './farms.service';

@ApiTags('farms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farms')
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  @Roles(UserRole.FARM_OWNER)
  create(
    @CurrentUser() user: { id: string; role: UserRole; mobileNumber: string },
    @Body() dto: CreateFarmDto,
  ) {
    return this.farmsService.createFarmForOwner(user, dto, user.mobileNumber);
  }

  @Get('my')
  @Roles(UserRole.FARM_OWNER)
  myFarms(@CurrentUser('id') userId: string) {
    return this.farmsService.listMyFarms(userId);
  }

  @Get(':id')
  @Roles(
    UserRole.FARM_OWNER,
    UserRole.PLATFORM_OWNER,
    UserRole.DELIVERY_STAFF,
    UserRole.CUSTOMER,
  )
  getOne(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmsService.getFarm(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.FARM_OWNER)
  update(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFarmDto,
  ) {
    return this.farmsService.updateFarm(user, id, dto);
  }

  @Get(':farmId/members')
  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  members(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
  ) {
    return this.farmsService.listMembers(user, farmId);
  }
}

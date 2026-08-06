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
  ChangeRateDto,
  CreateFarmProductDto,
  UpdateFarmProductDto,
} from './dto/farm-product.dto';
import { FarmProductsService } from './farm-products.service';

@ApiTags('farm-products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER, UserRole.DELIVERY_STAFF)
@Controller('farms/:farmId/products')
export class FarmProductsController {
  constructor(private readonly farmProductsService: FarmProductsService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: CreateFarmProductDto,
  ) {
    return this.farmProductsService.create(user, farmId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
  ) {
    return this.farmProductsService.findAll(user, farmId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmProductsService.findOne(user, farmId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFarmProductDto,
  ) {
    return this.farmProductsService.update(user, farmId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmProductsService.remove(user, farmId, id);
  }

  @Post(':id/change-rate')
  changeRate(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRateDto,
  ) {
    return this.farmProductsService.changeRate(user, farmId, id, dto);
  }

  @Get(':id/rate-history')
  rateHistory(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmProductsService.rateHistory(user, farmId, id);
  }
}

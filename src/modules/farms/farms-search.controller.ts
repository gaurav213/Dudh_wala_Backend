import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { SearchFarmsDto } from './dto/farm-search.dto';
import { FarmsSearchService } from './farms-search.service';
import { FarmsService } from './farms.service';

/**
 * Public marketplace search — no role guard, but `search` uses an optional
 * JWT guard so authenticated customers can additionally filter by a saved
 * addressId. Must be registered before FarmsController so that
 * "/farms/search" and "/farms/:farmId/public" resolve before the generic
 * "/farms/:id" route.
 */
@ApiTags('farms')
@Controller('farms')
export class FarmsSearchController {
  constructor(
    private readonly farmsSearchService: FarmsSearchService,
    private readonly farmsService: FarmsService,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('search')
  search(
    @CurrentUser() user: { id: string; role: UserRole } | undefined,
    @Query() query: SearchFarmsDto,
  ) {
    return this.farmsSearchService.search(query, user);
  }

  @Get(':farmId/public')
  publicDetail(@Param('farmId', ParseUUIDPipe) farmId: string) {
    return this.farmsService.getPublicFarm(farmId);
  }
}

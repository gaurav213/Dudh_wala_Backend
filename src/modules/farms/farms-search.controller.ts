import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchFarmsDto } from './dto/farm-search.dto';
import { FarmsSearchService } from './farms-search.service';

/**
 * Public marketplace search — intentionally has no auth/role guards and
 * must be registered before FarmsController so that "/farms/search" is
 * matched before the "/farms/:id" route.
 */
@ApiTags('farms')
@Controller('farms')
export class FarmsSearchController {
  constructor(private readonly farmsSearchService: FarmsSearchService) {}

  @Get('search')
  search(@Query() query: SearchFarmsDto) {
    return this.farmsSearchService.search(query);
  }
}

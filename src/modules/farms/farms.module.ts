import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminFarmsController } from './admin-farms.controller';
import { FarmMilkProduct } from './entities/farm-milk-product.entity';
import { FarmMember } from './entities/farm-member.entity';
import { FarmServiceArea } from './entities/farm-service-area.entity';
import { Farm } from './entities/farm.entity';
import { MilkRateHistory } from './entities/milk-rate-history.entity';
import { FarmProductsController } from './farm-products.controller';
import { FarmProductsService } from './farm-products.service';
import { FarmServiceAreasController } from './farm-service-areas.controller';
import { FarmServiceAreasService } from './farm-service-areas.service';
import { FarmsController } from './farms.controller';
import { FarmsSearchController } from './farms-search.controller';
import { FarmsSearchService } from './farms-search.service';
import { FarmsService } from './farms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Farm,
      FarmMember,
      FarmServiceArea,
      FarmMilkProduct,
      MilkRateHistory,
    ]),
  ],
  controllers: [
    // FarmsSearchController must be registered before FarmsController so
    // "/farms/search" resolves before the "/farms/:id" wildcard route.
    FarmsSearchController,
    FarmsController,
    AdminFarmsController,
    FarmServiceAreasController,
    FarmProductsController,
  ],
  providers: [
    FarmsService,
    FarmServiceAreasService,
    FarmProductsService,
    FarmsSearchService,
  ],
  exports: [FarmsService, TypeOrmModule],
})
export class FarmsModule {}

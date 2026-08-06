import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { FarmStatus, ServiceAreaStatus } from '../../common/enums';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { SearchFarmsDto } from './dto/farm-search.dto';
import { FarmMilkProduct } from './entities/farm-milk-product.entity';
import { FarmServiceArea } from './entities/farm-service-area.entity';
import { Farm } from './entities/farm.entity';
import { matchesProduct } from './farm-search.util';

@Injectable()
export class FarmsSearchService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
  ) {}

  async search(query: SearchFarmsDto) {
    const qb = this.farmsRepo
      .createQueryBuilder('f')
      .where('f.status = :farmStatus', { farmStatus: FarmStatus.ACTIVE });

    this.applyServiceAreaExists(qb, query);
    this.applyProductExists(qb, query);

    qb.orderBy('f.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [farms, total] = await qb.getManyAndCount();
    const data = await Promise.all(
      farms.map((farm) => this.toSearchResult(farm, query)),
    );

    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  private applyServiceAreaExists(
    qb: SelectQueryBuilder<Farm>,
    query: SearchFarmsDto,
  ) {
    qb.andWhere((sub) => {
      const subQuery = sub
        .subQuery()
        .select('1')
        .from(FarmServiceArea, 'sa')
        .where('sa.farm_id = f.id')
        .andWhere('sa.status = :saStatus');
      if (query.postalCode) {
        subQuery.andWhere('sa.postal_code = :postalCode');
      }
      if (query.area) {
        subQuery.andWhere('sa.area_name ILIKE :area');
      }
      if (query.city) {
        subQuery.andWhere('sa.city ILIKE :city');
      }
      return `EXISTS ${subQuery.getQuery()}`;
    });
    qb.setParameters({
      saStatus: ServiceAreaStatus.ACTIVE,
      ...(query.postalCode ? { postalCode: query.postalCode } : {}),
      ...(query.area ? { area: `%${query.area}%` } : {}),
      ...(query.city ? { city: `%${query.city}%` } : {}),
    });
  }

  private applyProductExists(
    qb: SelectQueryBuilder<Farm>,
    query: SearchFarmsDto,
  ) {
    qb.andWhere((sub) => {
      const subQuery = sub
        .subQuery()
        .select('1')
        .from(FarmMilkProduct, 'p')
        .where('p.farm_id = f.id')
        .andWhere('p.is_available = true')
        .andWhere('p.deleted_at IS NULL');
      if (query.milkType) {
        subQuery.andWhere('p.milk_type = :milkType');
      }
      if (query.deliveryShift) {
        subQuery.andWhere('p.available_shifts @> :shift::jsonb');
      }
      return `EXISTS ${subQuery.getQuery()}`;
    });
    qb.setParameters({
      ...(query.milkType ? { milkType: query.milkType } : {}),
      ...(query.deliveryShift
        ? { shift: JSON.stringify([query.deliveryShift]) }
        : {}),
    });
  }

  private async toSearchResult(farm: Farm, query: SearchFarmsDto) {
    const products = await this.productsRepo.find({
      where: { farmId: farm.id, isAvailable: true },
    });
    const matched = products.filter((p) =>
      matchesProduct(p, {
        milkType: query.milkType,
        deliveryShift: query.deliveryShift,
      }),
    );
    return {
      id: farm.id,
      name: farm.name,
      area: farm.area,
      city: farm.city,
      postalCode: farm.postalCode,
      products: matched.map((p) => ({
        id: p.id,
        name: p.name,
        milkType: p.milkType,
        currentRatePerLitre: p.currentRatePerLitre,
        minimumQuantity: p.minimumQuantity,
        availableShifts: p.availableShifts,
      })),
    };
  }
}

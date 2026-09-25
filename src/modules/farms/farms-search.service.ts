import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In } from 'typeorm';
import { FarmStatus, ServiceAreaStatus, UserRole, ConnectionStatus, SubscriptionStatus } from '../../common/enums';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { FarmCustomerConnection } from '../connections/entities/farm-customer-connection.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomerAddress } from '../customer-addresses/entities/customer-address.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { SearchFarmsDto } from './dto/farm-search.dto';
import { FarmMilkProduct } from './entities/farm-milk-product.entity';
import { FarmServiceArea } from './entities/farm-service-area.entity';
import { Farm } from './entities/farm.entity';
import {
  computeServiceAreaMatchTier,
  matchesProduct,
  ServiceAreaMatchTier,
} from './farm-search.util';

interface EffectiveLocationFilters {
  postalCode?: string;
  area?: string;
  city?: string;
}

const TIER_ORDER: Record<ServiceAreaMatchTier, number> = {
  EXACT_PIN: 0,
  AREA_CITY: 1,
  CITY: 2,
  NONE: 3,
};

@Injectable()
export class FarmsSearchService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
    @InjectRepository(FarmServiceArea)
    private readonly serviceAreasRepo: Repository<FarmServiceArea>,
    @InjectRepository(CustomerAddress)
    private readonly addressesRepo: Repository<CustomerAddress>,
    @InjectRepository(FarmCustomerConnection)
    private readonly connectionsRepo: Repository<FarmCustomerConnection>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(MilkSubscription)
    private readonly subscriptionsRepo: Repository<MilkSubscription>,
  ) {}

  async search(query: SearchFarmsDto, user?: { id: string; role: UserRole }) {
    const filters = await this.resolveLocationFilters(query, user);

    const qb = this.farmsRepo
      .createQueryBuilder('f')
      .where('f.status = :farmStatus', { farmStatus: FarmStatus.ACTIVE });

    this.applyServiceAreaExists(qb, filters);
    this.applyProductExists(qb, query);

    qb.orderBy('f.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [farms, total] = await qb.getManyAndCount();
    const connectionByFarm = await this.connectionLabelsForUser(
      user,
      farms.map((f) => f.id),
    );
    const data = await Promise.all(
      farms.map(async (farm) => ({
        ...(await this.toSearchResult(farm, query, filters)),
        connection: connectionByFarm.get(farm.id) ?? {
          connected: false,
          products: [] as { name: string; milkType: string }[],
        },
      })),
    );
    data.sort(
      (a, b) => TIER_ORDER[a.serviceAreaMatch] - TIER_ORDER[b.serviceAreaMatch],
    );

    const meta: Record<string, unknown> = {
      ...buildPageMeta(query.page, query.limit, total),
    };
    if (query.includeDiagnostics && user?.role === UserRole.CUSTOMER) {
      const diagnostics = await this.buildDiagnostics(filters, total);
      if (diagnostics) meta.diagnostics = diagnostics;
    }

    return { data, meta };
  }

  private async connectionLabelsForUser(
    user: { id: string; role: UserRole } | undefined,
    farmIds: string[],
  ) {
    const map = new Map<
      string,
      { connected: boolean; products: { name: string; milkType: string }[] }
    >();
    if (!user || user.role !== UserRole.CUSTOMER || !farmIds.length) {
      return map;
    }
    const connections = await this.connectionsRepo.find({
      where: {
        customerUserId: user.id,
        status: ConnectionStatus.ACTIVE,
        farmId: In(farmIds),
      },
    });
    if (!connections.length) return map;

    const ledgerCustomers = await this.customersRepo.find({
      where: { customerUserId: user.id },
    });
    const ledgerIds = ledgerCustomers.map((c) => c.id);
    const subs =
      ledgerIds.length === 0
        ? []
        : await this.subscriptionsRepo.find({
            where: {
              customerId: In(ledgerIds),
              farmId: In(connections.map((c) => c.farmId)),
              status: SubscriptionStatus.ACTIVE,
            },
          });

    const milkLabel = (milkType: string) => {
      const map: Record<string, string> = {
        COW: 'Cow Milk',
        BUFFALO: 'Buffalo Milk',
        MIXED: 'Mixed Milk',
        TONED: 'Toned Milk',
        OTHER: 'Other Milk',
      };
      return map[milkType] ?? milkType;
    };
    const productsByFarm = new Map<string, { name: string; milkType: string }[]>();
    for (const s of subs) {
      if (!s.farmId) continue;
      const list = productsByFarm.get(s.farmId) ?? [];
      const label = {
        name: milkLabel(s.milkType),
        milkType: s.milkType,
      };
      if (!list.some((p) => p.milkType === label.milkType)) list.push(label);
      productsByFarm.set(s.farmId, list);
    }

    for (const c of connections) {
      map.set(c.farmId, {
        connected: true,
        products: productsByFarm.get(c.farmId) ?? [],
      });
    }
    return map;
  }

  private async resolveLocationFilters(
    query: SearchFarmsDto,
    user?: { id: string; role: UserRole },
  ): Promise<EffectiveLocationFilters> {
    if (!query.addressId) {
      return {
        postalCode: query.postalCode,
        area: query.area,
        city: query.city,
      };
    }
    if (!user) {
      throw new UnauthorizedException(
        'Authentication is required to search by addressId',
      );
    }
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customers can search by addressId');
    }
    const address = await this.addressesRepo.findOne({
      where: { id: query.addressId },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    if (address.customerUserId !== user.id) {
      throw new ForbiddenException('You do not own this address');
    }
    return {
      postalCode: query.postalCode ?? address.postalCode,
      area: query.area ?? address.area,
      city: query.city ?? address.city,
    };
  }

  private applyServiceAreaExists(
    qb: SelectQueryBuilder<Farm>,
    filters: EffectiveLocationFilters,
  ) {
    // A farm must always have at least one ACTIVE service area to be
    // discoverable at all; location filters (when provided) further narrow
    // that requirement using priority OR-matching (exact PIN > area+city >
    // city) rather than a strict AND across all three.
    const orConditions: string[] = [];
    if (filters.postalCode) orConditions.push('sa.postal_code = :postalCode');
    if (filters.area && filters.city) {
      orConditions.push('(sa.area_name ILIKE :area AND sa.city ILIKE :city)');
    }
    if (filters.city) orConditions.push('sa.city ILIKE :city');
    if (orConditions.length === 0 && filters.area) {
      orConditions.push('sa.area_name ILIKE :area');
    }

    qb.andWhere((sub) => {
      const subQuery = sub
        .subQuery()
        .select('1')
        .from(FarmServiceArea, 'sa')
        .where('sa.farm_id = f.id')
        .andWhere('sa.status = :saStatus');
      if (orConditions.length > 0) {
        subQuery.andWhere(`(${orConditions.join(' OR ')})`);
      }
      return `EXISTS ${subQuery.getQuery()}`;
    });
    qb.setParameters({
      saStatus: ServiceAreaStatus.ACTIVE,
      ...(filters.postalCode ? { postalCode: filters.postalCode } : {}),
      ...(filters.area ? { area: `%${filters.area}%` } : {}),
      ...(filters.city ? { city: `%${filters.city}%` } : {}),
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

  private async toSearchResult(
    farm: Farm,
    query: SearchFarmsDto,
    filters: EffectiveLocationFilters,
  ) {
    const [products, areas] = await Promise.all([
      this.productsRepo.find({ where: { farmId: farm.id, isAvailable: true } }),
      this.serviceAreasRepo.find({ where: { farmId: farm.id } }),
    ]);
    const matched = products.filter((p) =>
      matchesProduct(p, {
        milkType: query.milkType,
        deliveryShift: query.deliveryShift,
      }),
    );
    return {
      id: farm.id,
      name: farm.name,
      description: farm.description,
      area: farm.area,
      city: farm.city,
      postalCode: farm.postalCode,
      serviceAreaMatch: computeServiceAreaMatchTier(areas, filters),
      products: matched.map((p) => ({
        id: p.id,
        name: p.name,
        milkType: p.milkType,
        currentRatePerLitre: p.currentRatePerLitre,
        minimumQuantity: p.minimumQuantity,
        maximumQuantity: p.maximumQuantity,
        availableShifts: p.availableShifts,
      })),
    };
  }

  private async countFarmsMatchingTier(
    tier: 'postalCode' | 'areaCity' | 'city',
    filters: EffectiveLocationFilters,
  ): Promise<number> {
    const qb = this.farmsRepo
      .createQueryBuilder('f')
      .where('f.status = :farmStatus', { farmStatus: FarmStatus.ACTIVE });
    qb.andWhere((sub) => {
      const subQuery = sub
        .subQuery()
        .select('1')
        .from(FarmServiceArea, 'sa')
        .where('sa.farm_id = f.id')
        .andWhere('sa.status = :saStatus');
      if (tier === 'postalCode')
        subQuery.andWhere('sa.postal_code = :postalCode');
      if (tier === 'areaCity') {
        subQuery
          .andWhere('sa.area_name ILIKE :area')
          .andWhere('sa.city ILIKE :city');
      }
      if (tier === 'city') subQuery.andWhere('sa.city ILIKE :city');
      return `EXISTS ${subQuery.getQuery()}`;
    });
    qb.setParameters({
      saStatus: ServiceAreaStatus.ACTIVE,
      postalCode: filters.postalCode ?? null,
      area: `%${filters.area ?? ''}%`,
      city: `%${filters.city ?? ''}%`,
    });
    return qb.getCount();
  }

  private async buildDiagnostics(
    filters: EffectiveLocationFilters,
    finalTotal: number,
  ): Promise<
    { reasons: Array<{ code: string; message: string }> } | undefined
  > {
    if (!filters.postalCode && !filters.area && !filters.city) return undefined;

    const [pinCount, areaCityCount, cityCount] = await Promise.all([
      filters.postalCode
        ? this.countFarmsMatchingTier('postalCode', filters)
        : Promise.resolve(0),
      filters.area && filters.city
        ? this.countFarmsMatchingTier('areaCity', filters)
        : Promise.resolve(0),
      filters.city
        ? this.countFarmsMatchingTier('city', filters)
        : Promise.resolve(0),
    ]);
    const anyLocationMatch = pinCount > 0 || areaCityCount > 0 || cityCount > 0;

    const reasons: Array<{ code: string; message: string }> = [];
    if (filters.postalCode && pinCount === 0) {
      reasons.push({
        code: 'noActiveFarmsInPostalCode',
        message: 'No active farms currently serve this exact postal code.',
      });
    }
    if (cityCount > 0 && pinCount === 0 && areaCityCount === 0) {
      reasons.push({
        code: 'farmsInCityButNotArea',
        message:
          'Some farms serve your city, but none serve your specific area or postal code yet.',
      });
    }
    if (anyLocationMatch && finalTotal === 0) {
      reasons.push({
        code: 'matchingFarmNoProducts',
        message:
          'Farms serve your area, but none currently have matching available products for your filters.',
      });
    }
    return { reasons };
  }
}

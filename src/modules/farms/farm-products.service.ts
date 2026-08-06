import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { UserRole } from '../../common/enums';
import { roundMoney, roundQty } from '../../common/utils/decimal.util';
import { assertFound } from '../../common/utils/ownership.util';
import {
  ChangeRateDto,
  CreateFarmProductDto,
  UpdateFarmProductDto,
} from './dto/farm-product.dto';
import { FarmMilkProduct } from './entities/farm-milk-product.entity';
import { MilkRateHistory } from './entities/milk-rate-history.entity';
import { FarmsService } from './farms.service';
import { planRateChange } from './milk-rate.util';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class FarmProductsService {
  constructor(
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
    @InjectRepository(MilkRateHistory)
    private readonly rateHistoryRepo: Repository<MilkRateHistory>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly farmsService: FarmsService,
  ) {}

  async create(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: CreateFarmProductDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const rate = roundMoney(dto.currentRatePerLitre);
    const effectiveFrom = todayDateString();

    return this.dataSource.transaction(async (manager) => {
      const product = await manager.save(
        manager.create(FarmMilkProduct, {
          farmId,
          name: dto.name,
          milkType: dto.milkType,
          description: dto.description ?? null,
          currentRatePerLitre: rate,
          minimumQuantity: roundQty(dto.minimumQuantity),
          maximumQuantity: dto.maximumQuantity
            ? roundQty(dto.maximumQuantity)
            : null,
          availableShifts: dto.availableShifts,
          isAvailable: dto.isAvailable ?? true,
        }),
      );
      await manager.save(
        manager.create(MilkRateHistory, {
          farmProductId: product.id,
          ratePerLitre: rate,
          effectiveFrom,
          effectiveTo: null,
          createdByUserId: user.id,
        }),
      );
      return product;
    });
  }

  async findAll(user: { id: string; role: UserRole }, farmId: string) {
    await this.farmsService.getFarm(user, farmId);
    return this.productsRepo.find({
      where: { farmId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    await this.farmsService.getFarm(user, farmId);
    return this.findProductOrFail(farmId, id);
  }

  async update(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
    dto: UpdateFarmProductDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const product = await this.findProductOrFail(farmId, id);
    Object.assign(product, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.milkType !== undefined ? { milkType: dto.milkType } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description ?? null }
        : {}),
      ...(dto.minimumQuantity !== undefined
        ? { minimumQuantity: roundQty(dto.minimumQuantity) }
        : {}),
      ...(dto.maximumQuantity !== undefined
        ? {
            maximumQuantity: dto.maximumQuantity
              ? roundQty(dto.maximumQuantity)
              : null,
          }
        : {}),
      ...(dto.availableShifts !== undefined
        ? { availableShifts: dto.availableShifts }
        : {}),
      ...(dto.isAvailable !== undefined
        ? { isAvailable: dto.isAvailable }
        : {}),
    });
    return this.productsRepo.save(product);
  }

  async remove(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const product = await this.findProductOrFail(farmId, id);
    await this.productsRepo.softRemove(product);
    return { success: true };
  }

  async changeRate(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
    dto: ChangeRateDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const product = await this.findProductOrFail(farmId, id);
    const effectiveFrom = dto.effectiveFrom ?? todayDateString();
    const newRate = roundMoney(dto.ratePerLitre);

    const openPeriod = await this.rateHistoryRepo.findOne({
      where: { farmProductId: id, effectiveTo: IsNull() },
      order: { effectiveFrom: 'DESC' },
    });

    const plan = planRateChange(openPeriod, newRate, effectiveFrom);

    return this.dataSource.transaction(async (manager) => {
      if (plan.closedPreviousId && openPeriod) {
        openPeriod.effectiveTo = plan.closedEffectiveTo;
        await manager.save(openPeriod);
      }
      const created = await manager.save(
        manager.create(MilkRateHistory, {
          farmProductId: id,
          ratePerLitre: plan.newPeriod.ratePerLitre,
          effectiveFrom: plan.newPeriod.effectiveFrom,
          effectiveTo: null,
          createdByUserId: user.id,
        }),
      );
      product.currentRatePerLitre = plan.newPeriod.ratePerLitre;
      const savedProduct = await manager.save(product);
      return { product: savedProduct, rateHistory: created };
    });
  }

  async rateHistory(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    await this.farmsService.getFarm(user, farmId);
    await this.findProductOrFail(farmId, id);
    return this.rateHistoryRepo.find({
      where: { farmProductId: id },
      order: { effectiveFrom: 'DESC' },
    });
  }

  private async findProductOrFail(farmId: string, id: string) {
    return assertFound(
      await this.productsRepo.findOne({ where: { id, farmId } }),
      'Product not found',
    );
  }
}

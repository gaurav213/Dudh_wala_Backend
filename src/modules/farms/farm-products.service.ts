import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  DeliveryStatus,
  NotificationType,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import { roundMoney, roundQty } from '../../common/utils/decimal.util';
import { assertFound } from '../../common/utils/ownership.util';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import {
  amountForQuantity,
  expectedQuantity,
} from '../deliveries/utils/delivery-quantity.util';
import { NotificationsService } from '../notifications/notifications.service';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
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
    @InjectRepository(MilkSubscription)
    private readonly subscriptionsRepo: Repository<MilkSubscription>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly farmsService: FarmsService,
    private readonly notifications: NotificationsService,
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
    const previousRate = roundMoney(product.currentRatePerLitre);
    const effectiveFrom = dto.effectiveFrom ?? todayDateString();
    const newRate = roundMoney(dto.ratePerLitre);

    const openPeriod = await this.rateHistoryRepo.findOne({
      where: { farmProductId: id, effectiveTo: IsNull() },
      order: { effectiveFrom: 'DESC' },
    });

    const plan = planRateChange(openPeriod, newRate, effectiveFrom);

    const result = await this.dataSource.transaction(async (manager) => {
      let rateHistory: MilkRateHistory;
      if (plan.mode === 'amend' && openPeriod) {
        openPeriod.ratePerLitre = plan.newPeriod.ratePerLitre;
        rateHistory = await manager.save(openPeriod);
      } else {
        if (plan.closedPreviousId && openPeriod) {
          openPeriod.effectiveTo = plan.closedEffectiveTo;
          await manager.save(openPeriod);
        }
        rateHistory = await manager.save(
          manager.create(MilkRateHistory, {
            farmProductId: id,
            ratePerLitre: plan.newPeriod.ratePerLitre,
            effectiveFrom: plan.newPeriod.effectiveFrom,
            effectiveTo: null,
            createdByUserId: user.id,
          }),
        );
      }

      product.currentRatePerLitre = plan.newPeriod.ratePerLitre;
      const savedProduct = await manager.save(product);

      // Keep subscription sticker price in sync with the live market rate.
      // Also attach orphaned same-farm / same-milk-type subs (legacy null farmProductId).
      await manager.update(
        MilkSubscription,
        { farmProductId: id },
        { ratePerLitre: plan.newPeriod.ratePerLitre },
      );
      await manager
        .createQueryBuilder()
        .update(MilkSubscription)
        .set({
          ratePerLitre: plan.newPeriod.ratePerLitre,
          farmProductId: id,
        })
        .where('farm_id = :farmId', { farmId })
        .andWhere('farm_product_id IS NULL')
        .andWhere('milk_type = :milkType', { milkType: product.milkType })
        .andWhere('status = :status', { status: SubscriptionStatus.ACTIVE })
        .execute();

      // Reprice undelivered stops on that day so the list matches the market rate.
      const openStops = await manager.find(MilkDelivery, {
        where: {
          farmProductId: id,
          deliveryDate: effectiveFrom,
          status: In([
            DeliveryStatus.PENDING,
            DeliveryStatus.OUT_FOR_DELIVERY,
          ]),
        },
      });
      for (const d of openStops) {
        d.ratePerLitre = plan.newPeriod.ratePerLitre;
        const qty = expectedQuantity({
          scheduledQuantity: d.scheduledQuantity,
          customerExtraQuantity: d.customerExtraQuantity,
          staffExtraQuantity: d.staffExtraQuantity,
        });
        d.quantity = qty;
        d.amount = amountForQuantity(qty, d.ratePerLitre);
        d.version += 1;
        await manager.save(d);
      }

      return {
        product: savedProduct,
        rateHistory,
        updatedOpenDeliveries: openStops.length,
      };
    });

    if (previousRate !== newRate) {
      await this.notifyCustomersOfRateChange({
        farmId,
        product: result.product,
        previousRate,
        newRate,
        effectiveFrom,
        createdByUserId: user.id,
      });
    }

    return result;
  }

  private async notifyCustomersOfRateChange(opts: {
    farmId: string;
    product: FarmMilkProduct;
    previousRate: string;
    newRate: string;
    effectiveFrom: string;
    createdByUserId: string;
  }) {
    // Linked product OR legacy orphaned subs on this farm with same milk type.
    const subs = await this.subscriptionsRepo.find({
      where: [
        {
          farmProductId: opts.product.id,
          status: SubscriptionStatus.ACTIVE,
        },
        {
          farmId: opts.farmId,
          farmProductId: IsNull(),
          milkType: opts.product.milkType,
          status: SubscriptionStatus.ACTIVE,
        },
      ],
      select: ['customerId'],
    });
    const customerIds = [...new Set(subs.map((s) => s.customerId))];
    if (!customerIds.length) return;

    const customers = await this.customersRepo.find({
      where: { id: In(customerIds) },
      select: ['id', 'customerUserId'],
    });
    const recipientUserIds = [
      ...new Set(
        customers
          .map((c) => c.customerUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!recipientUserIds.length) return;

    const farm = await this.farmsService.getFarm(
      { id: opts.createdByUserId, role: UserRole.FARM_OWNER },
      opts.farmId,
    );

    await this.notifications.notify({
      type: NotificationType.PRODUCT_RATE_CHANGED,
      title: 'Milk rate updated',
      body: `${opts.product.name} at ${farm.name} is now ₹${opts.newRate}/L (was ₹${opts.previousRate}/L).`,
      messageKey: 'notifRateUpdated',
      params: {
        product: opts.product.name,
        farm: farm.name,
        newRate: opts.newRate,
        previousRate: opts.previousRate,
      },
      recipientUserIds,
      route: '/customer/billing',
      farmId: opts.farmId,
      entityType: 'FARM_MILK_PRODUCT',
      entityId: opts.product.id,
      createdByUserId: opts.createdByUserId,
      data: {
        productName: opts.product.name,
        previousRate: opts.previousRate,
        ratePerLitre: opts.newRate,
        effectiveFrom: opts.effectiveFrom,
      },
    });
  }

  async activate(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    return this.setAvailability(user, farmId, id, true);
  }

  async deactivate(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    return this.setAvailability(user, farmId, id, false);
  }

  private async setAvailability(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
    isAvailable: boolean,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const product = await this.findProductOrFail(farmId, id);
    product.isAvailable = isAvailable;
    return this.productsRepo.save(product);
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

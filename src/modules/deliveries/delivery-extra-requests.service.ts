import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import {
  DeliveryConfirmationStatus,
  DeliveryEventType,
  DeliveryStatus,
  ExtraRequestStatus,
  NotificationType,
  UserRole,
} from '../../common/enums';
import { roundQty } from '../../common/utils/decimal.util';
import { assertFound } from '../../common/utils/ownership.util';
import { FarmDeliverySettings } from '../farms/entities/farm-delivery-settings.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import {
  CreateExtraRequestDto,
  ReviewExtraRequestDto,
} from './dto/delivery-ops.dto';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { DeliveryExtraRequest } from './entities/delivery-extra-request.entity';
import { MilkDelivery } from './entities/milk-delivery.entity';
import {
  amountForQuantity,
  expectedQuantity,
} from './utils/delivery-quantity.util';

@Injectable()
export class DeliveryExtraRequestsService {
  constructor(
    @InjectRepository(DeliveryExtraRequest)
    private readonly extrasRepo: Repository<DeliveryExtraRequest>,
    @InjectRepository(MilkSubscription)
    private readonly subsRepo: Repository<MilkSubscription>,
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(DeliveryEvent)
    private readonly eventsRepo: Repository<DeliveryEvent>,
    @InjectRepository(FarmDeliverySettings)
    private readonly settingsRepo: Repository<FarmDeliverySettings>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    user: { id: string; role: UserRole },
    dto: CreateExtraRequestDto,
  ) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customers can request extra milk');
    }
    const qty = roundQty(dto.requestedQuantity);
    if (new Decimal(qty).lte(0)) {
      throw new BadRequestException('requestedQuantity must be > 0');
    }
    const sub = assertFound(
      await this.subsRepo.findOne({ where: { id: dto.subscriptionId } }),
      'Subscription not found',
    );
    // Customer must own the linked customer user on subscription's customer row
    // Resolved via delivery.customerUserId path after create; soft check via customer relation later.
    const farmId = sub.farmId;
    if (!farmId) {
      throw new BadRequestException('Subscription is not linked to a farm');
    }

    const pending = await this.extrasRepo.findOne({
      where: {
        subscriptionId: sub.id,
        deliveryDate: dto.deliveryDate,
        status: ExtraRequestStatus.PENDING,
      },
    });
    if (pending) {
      throw new ConflictException(
        'A pending extra request already exists for this subscription and date',
      );
    }

    const delivery = await this.deliveriesRepo.findOne({
      where: {
        subscriptionId: sub.id,
        deliveryDate: dto.deliveryDate,
        deliveryShift: sub.deliveryShift,
      },
    });

    try {
      const row = await this.extrasRepo.save(
        this.extrasRepo.create({
          farmId,
          customerUserId: user.id,
          subscriptionId: sub.id,
          deliveryId: delivery?.id ?? null,
          deliveryDate: dto.deliveryDate,
          requestedQuantity: qty,
          status: ExtraRequestStatus.PENDING,
          notes: dto.notes ?? null,
          requestedAt: new Date(),
        }),
      );

      const recipients = [sub.supplierId];
      if (sub.assignedDeliveryUserId) {
        recipients.push(sub.assignedDeliveryUserId);
      }
      await this.notifications.notify({
        type: NotificationType.EXTRA_MILK_REQUESTED,
        title: 'Extra milk requested',
        body: `Customer requested +${qty} L for ${dto.deliveryDate}`,
        messageKey: 'notifExtraRequested',
        params: { qty, date: dto.deliveryDate },
        recipientUserIds: recipients,
        route: '/delivery/extra-requests',
        farmId,
        entityType: 'EXTRA_REQUEST',
        entityId: row.id,
        data: { extraRequestId: row.id, deliveryDate: dto.deliveryDate },
        createdByUserId: user.id,
      });

      if (delivery) {
        await this.eventsRepo.save(
          this.eventsRepo.create({
            deliveryId: delivery.id,
            eventType: DeliveryEventType.CUSTOMER_EXTRA_REQUESTED,
            actorUserId: user.id,
            actorRole: user.role,
            previousStatus: delivery.status,
            newStatus: delivery.status,
            quantity: qty,
            notes: dto.notes ?? null,
          }),
        );
      }
      return row;
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(
          'A pending extra request already exists for this subscription and date',
        );
      }
      throw err;
    }
  }

  async myRequests(user: { id: string; role: UserRole }) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Customer only');
    }
    return this.extrasRepo.find({
      where: { customerUserId: user.id },
      order: { requestedAt: 'DESC' },
      take: 100,
    });
  }

  async assignedRequests(user: { id: string; role: UserRole }, date?: string) {
    const qb = this.extrasRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.subscription', 's')
      .orderBy('e.requestedAt', 'DESC')
      .take(200);
    if (date) qb.andWhere('e.deliveryDate = :date', { date });

    if (user.role === UserRole.FARM_OWNER) {
      qb.andWhere('s.supplierId = :sid', { sid: user.id });
    } else if (user.role === UserRole.DELIVERY_STAFF) {
      qb.andWhere(
        '(s.assignedDeliveryUserId = :uid OR e.farmId IN ' +
          "(SELECT fm.farm_id FROM farm_members fm WHERE fm.user_id = :uid AND fm.status = 'ACTIVE'))",
        { uid: user.id },
      );
    } else if (user.role !== UserRole.PLATFORM_OWNER) {
      throw new ForbiddenException();
    }
    return qb.getMany();
  }

  async accept(
    user: { id: string; role: UserRole },
    id: string,
    dto: ReviewExtraRequestDto,
  ) {
    const row = await this.getForReview(user, id);
    row.status = ExtraRequestStatus.ACCEPTED;
    row.reviewedByUserId = user.id;
    row.reviewedAt = new Date();
    if (dto.notes) row.notes = dto.notes;
    await this.extrasRepo.save(row);

    let delivery = row.deliveryId
      ? await this.deliveriesRepo.findOne({ where: { id: row.deliveryId } })
      : await this.deliveriesRepo.findOne({
          where: {
            subscriptionId: row.subscriptionId,
            deliveryDate: row.deliveryDate,
          },
        });

    if (delivery) {
      const previousStatus = delivery.status;
      delivery.customerExtraQuantity = roundQty(row.requestedQuantity);
      const expected = expectedQuantity({
        scheduledQuantity: delivery.scheduledQuantity,
        customerExtraQuantity: delivery.customerExtraQuantity,
        staffExtraQuantity: delivery.staffExtraQuantity,
      });
      delivery.quantity = expected;
      delivery.amount = amountForQuantity(expected, delivery.ratePerLitre);
      // Extra accepted after mark-delivered — reopen so pour can be confirmed again.
      if (previousStatus === DeliveryStatus.DELIVERED) {
        delivery.status = DeliveryStatus.PENDING;
        delivery.confirmationStatus =
          DeliveryConfirmationStatus.NOT_CONFIRMED;
        delivery.finalDeliveredQuantity = null;
        delivery.deliveredAt = null;
        delivery.deliveredByUserId = null;
      }
      delivery.version += 1;
      delivery = await this.deliveriesRepo.save(delivery);
      row.deliveryId = delivery.id;
      await this.extrasRepo.save(row);
    }

    await this.notifications.notify({
      type: NotificationType.EXTRA_REQUEST_ACCEPTED,
      title: 'Extra milk accepted',
      body: `Your +${row.requestedQuantity} L request was accepted.`,
      messageKey: 'notifExtraAccepted',
      params: { qty: row.requestedQuantity },
      recipientUserIds: [row.customerUserId],
      route: '/customer/extra-request',
      farmId: row.farmId,
      entityType: 'EXTRA_REQUEST',
      entityId: row.id,
      createdByUserId: user.id,
    });
    return row;
  }

  async reject(
    user: { id: string; role: UserRole },
    id: string,
    dto: ReviewExtraRequestDto,
  ) {
    const row = await this.getForReview(user, id);
    row.status = ExtraRequestStatus.REJECTED;
    row.reviewedByUserId = user.id;
    row.reviewedAt = new Date();
    if (dto.notes) row.notes = dto.notes;
    await this.extrasRepo.save(row);
    await this.notifications.notify({
      type: NotificationType.EXTRA_REQUEST_REJECTED,
      title: 'Extra milk rejected',
      body: `Your +${row.requestedQuantity} L request was rejected.`,
      messageKey: 'notifExtraRejected',
      params: { qty: row.requestedQuantity },
      recipientUserIds: [row.customerUserId],
      route: '/customer/extra-request',
      farmId: row.farmId,
      entityType: 'EXTRA_REQUEST',
      entityId: row.id,
      createdByUserId: user.id,
    });
    return row;
  }

  async cancel(user: { id: string; role: UserRole }, id: string) {
    const row = assertFound(
      await this.extrasRepo.findOne({ where: { id } }),
      'Extra request not found',
    );
    if (row.customerUserId !== user.id) {
      throw new ForbiddenException();
    }
    if (row.status !== ExtraRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    row.status = ExtraRequestStatus.CANCELLED;
    await this.extrasRepo.save(row);
    if (row.deliveryId) {
      await this.eventsRepo.save(
        this.eventsRepo.create({
          deliveryId: row.deliveryId,
          eventType: DeliveryEventType.CUSTOMER_EXTRA_CANCELLED,
          actorUserId: user.id,
          actorRole: user.role,
          quantity: row.requestedQuantity,
        }),
      );
    }
    return row;
  }

  private async getForReview(user: { id: string; role: UserRole }, id: string) {
    const row = assertFound(
      await this.extrasRepo.findOne({
        where: { id },
        relations: ['subscription'],
      }),
      'Extra request not found',
    );
    if (row.status !== ExtraRequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }
    if (user.role === UserRole.PLATFORM_OWNER) return row;
    if (
      user.role === UserRole.FARM_OWNER &&
      row.subscription.supplierId === user.id
    ) {
      return row;
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      const settings = await this.settingsRepo.findOne({
        where: { farmId: row.farmId },
      });
      const canApprove =
        settings?.deliveryStaffCanApproveExtraRequests === true;
      const member = await this.membersRepo.findOne({
        where: { farmId: row.farmId, userId: user.id },
      });
      if (canApprove && member) return row;
      throw new ForbiddenException(
        'Delivery staff cannot approve extra requests for this farm',
      );
    }
    throw new ForbiddenException();
  }
}

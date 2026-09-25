import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  BillStatus,
  DeliveryAssignmentStatus,
  DeliveryConfirmationStatus,
  DeliveryEditReason,
  DeliveryEditReviewStatus,
  DeliveryEventType,
  DeliveryIssueStatus,
  DeliveryIssueType,
  DeliveryStatus,
  FarmMemberRole,
  FarmMemberStatus,
  NotificationType,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import { todayIso } from '../../common/utils/date.util';
import { formatQtyDisplay, roundMoney, roundQty } from '../../common/utils/decimal.util';
import { isDeliveryRequiredOnDate } from '../../common/utils/subscription-schedule.util';
import { assertFound } from '../../common/utils/ownership.util';
import { AuditService } from '../audit/audit.service';
import { MonthlyBillItem } from '../billing/entities/monthly-bill-item.entity';
import { Customer } from '../customers/entities/customer.entity';
import { DeliveryAssignment } from '../farms/entities/delivery-assignment.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { Farm } from '../farms/entities/farm.entity';
import { FarmMilkProduct } from '../farms/entities/farm-milk-product.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { User } from '../users/entities/user.entity';
import {
  AddStaffExtraDto,
  CreateAdHocExtraDeliveryDto,
  CustomerConfirmDto,
  CustomerIssueDto,
  CustomerSkipDayDto,
  EditDeliveryDto,
  EditReviewDto,
  FarmSkipTodayDto,
  MarkDeliveredDto,
  ResolveDeliveryIssueDto,
  SkipCancelFailDto,
} from './dto/delivery-ops.dto';
import { DeliveryEditHistory } from './entities/delivery-edit-history.entity';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { DeliveryIssue } from './entities/delivery-issue.entity';
import { MilkDelivery } from './entities/milk-delivery.entity';
import {
  amountForQuantity,
  expectedQuantity,
  staffExtraFromFinal,
} from './utils/delivery-quantity.util';
import { editReasonLabel } from './utils/farm-today-metrics.util';

@Injectable()
export class DeliveryOpsService {
  constructor(
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(DeliveryEvent)
    private readonly eventsRepo: Repository<DeliveryEvent>,
    @InjectRepository(DeliveryIssue)
    private readonly issuesRepo: Repository<DeliveryIssue>,
    @InjectRepository(DeliveryEditHistory)
    private readonly editHistoryRepo: Repository<DeliveryEditHistory>,
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    @InjectRepository(MilkSubscription)
    private readonly subsRepo: Repository<MilkSubscription>,
    @InjectRepository(DeliveryAssignment)
    private readonly assignmentsRepo: Repository<DeliveryAssignment>,
    @InjectRepository(MonthlyBillItem)
    private readonly billItemsRepo: Repository<MonthlyBillItem>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {}

  async getAccessibleDelivery(
    user: { id: string; role: UserRole },
    deliveryId: string,
  ) {
    const delivery = assertFound(
      await this.deliveriesRepo.findOne({
        where: { id: deliveryId },
        relations: ['customer', 'subscription'],
      }),
      'Delivery not found',
    );
    await this.assertCanAccess(user, delivery);
    return delivery;
  }

  async listEvents(user: { id: string; role: UserRole }, deliveryId: string) {
    await this.getAccessibleDelivery(user, deliveryId);
    const events = await this.eventsRepo.find({
      where: { deliveryId },
      order: { createdAt: 'ASC' },
    });
    // Customers see delivery outcome, not farm Extra add/remove churn.
    if (user.role === UserRole.CUSTOMER) {
      const customerVisible = new Set<DeliveryEventType>([
        DeliveryEventType.OUT_FOR_DELIVERY,
        DeliveryEventType.MARKED_DELIVERED,
        DeliveryEventType.CUSTOMER_MARKED_RECEIVED,
        DeliveryEventType.CUSTOMER_CONFIRMED,
        DeliveryEventType.CUSTOMER_REPORTED_NOT_RECEIVED,
        DeliveryEventType.CUSTOMER_REPORTED_WRONG_QUANTITY,
        DeliveryEventType.CUSTOMER_EXTRA_REQUESTED,
        DeliveryEventType.CUSTOMER_EXTRA_CANCELLED,
        DeliveryEventType.SKIPPED,
        DeliveryEventType.CANCELLED,
        DeliveryEventType.FAILED,
        DeliveryEventType.DISPUTED,
        DeliveryEventType.RESOLVED,
        DeliveryEventType.DELIVERY_EDITED,
      ]);
      return events.filter((e) => customerVisible.has(e.eventType));
    }
    return events;
  }

  async outForDelivery(user: { id: string; role: UserRole }, id: string) {
    const delivery = await this.getAccessibleDelivery(user, id);
    if (
      delivery.status !== DeliveryStatus.PENDING &&
      delivery.status !== DeliveryStatus.OUT_FOR_DELIVERY
    ) {
      throw new BadRequestException('Delivery cannot move to OUT_FOR_DELIVERY');
    }
    return this.transition(user, delivery, {
      status: DeliveryStatus.OUT_FOR_DELIVERY,
      eventType: DeliveryEventType.OUT_FOR_DELIVERY,
      notify: async (d) => {
        if (d.customerUserId) {
          await this.notifications.notify({
            type: NotificationType.OUT_FOR_DELIVERY,
            title: 'Out for delivery',
            body: 'Your milk is on the way.',
            messageKey: 'notifOutForDelivery',
            recipientUserIds: [d.customerUserId],
            route: `/customer/deliveries/${d.id}`,
            farmId: d.farmId,
            entityType: 'DELIVERY',
            entityId: d.id,
            data: { deliveryId: d.id, farmId: d.farmId },
            createdByUserId: user.id,
          });
        }
      },
    });
  }

  async addStaffExtra(
    user: { id: string; role: UserRole },
    id: string,
    dto: AddStaffExtraDto,
  ) {
    const delivery = await this.getAccessibleDelivery(user, id);
    if (
      ![
        DeliveryStatus.PENDING,
        DeliveryStatus.OUT_FOR_DELIVERY,
        DeliveryStatus.DELIVERED,
      ].includes(delivery.status)
    ) {
      throw new BadRequestException(
        'Cannot add extra unless delivery is pending, out for delivery, or delivered',
      );
    }
    const qty = roundQty(dto.extraQuantity);
    const previousExtra = roundQty(delivery.staffExtraQuantity || '0');
    let delta: string;
    if (dto.replace) {
      if (new Decimal(qty).lt(0)) {
        throw new BadRequestException('Extra quantity must be >= 0');
      }
      delta = roundQty(new Decimal(qty).minus(previousExtra).toString());
      delivery.staffExtraQuantity = qty;
    } else {
      if (new Decimal(qty).lte(0)) {
        throw new BadRequestException('Extra quantity must be > 0');
      }
      delta = qty;
      delivery.staffExtraQuantity = roundQty(
        new Decimal(previousExtra).plus(qty).toString(),
      );
    }
    const previous = delivery.status;

    if (delivery.status === DeliveryStatus.DELIVERED) {
      // Extra changed after mark-delivered — reopen so farm/staff confirm the real pour.
      if (!new Decimal(delta).eq(0)) {
        delivery.status = DeliveryStatus.PENDING;
        delivery.confirmationStatus =
          DeliveryConfirmationStatus.NOT_CONFIRMED;
        delivery.finalDeliveredQuantity = null;
        delivery.deliveredAt = null;
        delivery.deliveredByUserId = null;
        this.syncExpected(delivery);
      }
    } else {
      this.syncExpected(delivery);
    }

    delivery.version += 1;
    if (dto.reason) {
      delivery.deliveryNotes = [delivery.deliveryNotes, dto.reason]
        .filter(Boolean)
        .join('\n');
    }
    const saved = await this.deliveriesRepo.save(delivery);
    // Skip no-op replaces (same total) — avoids timeline noise.
    if (!new Decimal(delta).eq(0) || !dto.replace) {
      await this.recordEvent({
        delivery: saved,
        eventType: DeliveryEventType.STAFF_EXTRA_ADDED,
        actor: user,
        previousStatus: previous,
        newStatus: saved.status,
        quantity: dto.replace ? qty : delta,
        notes: dto.reason ?? null,
      });
    }
    return saved;
  }

  async markDelivered(
    user: { id: string; role: UserRole },
    id: string,
    dto: MarkDeliveredDto,
  ) {
    const delivery = await this.getAccessibleDelivery(user, id);
    if (
      ![
        DeliveryStatus.PENDING,
        DeliveryStatus.OUT_FOR_DELIVERY,
        DeliveryStatus.DISPUTED,
      ].includes(delivery.status)
    ) {
      throw new BadRequestException('Delivery cannot be marked delivered');
    }
    const finalQty = roundQty(
      dto.finalDeliveredQuantity ??
        expectedQuantity({
          scheduledQuantity: delivery.scheduledQuantity,
          customerExtraQuantity: delivery.customerExtraQuantity,
          staffExtraQuantity: delivery.staffExtraQuantity,
        }),
    );
    if (new Decimal(finalQty).lte(0)) {
      throw new BadRequestException('Delivered quantity must be > 0');
    }
    // Pouring above daily need + customer extra counts as staff extra
    // (e.g. 1L schedule, mark 2L delivered → 1L staff extra).
    delivery.staffExtraQuantity = staffExtraFromFinal({
      finalDeliveredQuantity: finalQty,
      scheduledQuantity: delivery.scheduledQuantity,
      customerExtraQuantity: delivery.customerExtraQuantity,
    });
    const previous = delivery.status;
    delivery.status = DeliveryStatus.DELIVERED;
    delivery.confirmationStatus =
      DeliveryConfirmationStatus.FARM_MARKED_DELIVERED;
    delivery.finalDeliveredQuantity = finalQty;
    delivery.quantity = finalQty;
    delivery.amount = amountForQuantity(finalQty, delivery.ratePerLitre);
    delivery.deliveredByUserId = user.id;
    delivery.deliveredAt = new Date();
    if (dto.notes) delivery.deliveryNotes = dto.notes;
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);
    await this.recordEvent({
      delivery: saved,
      eventType: DeliveryEventType.MARKED_DELIVERED,
      actor: user,
      previousStatus: previous,
      newStatus: saved.status,
      quantity: finalQty,
      notes: dto.notes ?? null,
    });
    await this.auditService.log({
      actorUserId: user.id,
      supplierId: saved.supplierId,
      entityType: 'DELIVERY',
      entityId: saved.id,
      action: 'MARKED_DELIVERED',
      newValues: {
        finalDeliveredQuantity: finalQty,
        amount: saved.amount,
      },
    });

    const farmName = await this.farmName(saved.farmId);
    if (saved.customerUserId) {
      const expectedBefore = expectedQuantity({
        scheduledQuantity: delivery.scheduledQuantity,
        customerExtraQuantity: delivery.customerExtraQuantity,
        staffExtraQuantity: '0',
      });
      const isShort = new Decimal(finalQty).lt(expectedBefore);
      if (isShort) {
        const note = `Farm: short delivery ${formatQtyDisplay(finalQty)} L (scheduled ${formatQtyDisplay(expectedBefore)} L)`;
        saved.deliveryNotes = [saved.deliveryNotes, note]
          .filter(Boolean)
          .join('\n');
        await this.deliveriesRepo.save(saved);
      }
      await this.notifications.notify({
        type: NotificationType.MILK_DELIVERED,
        title: isShort ? 'Less milk today' : 'Milk Delivered 🥛',
        body: isShort
          ? `Only ${formatQtyDisplay(finalQty)} L delivered (scheduled ${formatQtyDisplay(expectedBefore)} L) from ${farmName}. Charged ₹${saved.amount}.`
          : `${formatQtyDisplay(finalQty)} L was marked delivered from ${farmName}. Today's amount: ₹${saved.amount}. Tap to confirm.`,
        messageKey: isShort ? 'notifMilkShort' : 'notifMilkDelivered',
        params: {
          qty: formatQtyDisplay(finalQty),
          expected: formatQtyDisplay(expectedBefore),
          farm: farmName,
          amount: saved.amount,
        },
        recipientUserIds: [saved.customerUserId],
        route: `/customer/deliveries/${saved.id}`,
        farmId: saved.farmId,
        entityType: 'DELIVERY',
        entityId: saved.id,
        data: {
          type: NotificationType.MILK_DELIVERED,
          deliveryId: saved.id,
          farmId: saved.farmId,
          route: `/customer/deliveries/${saved.id}`,
          shortDelivery: isShort,
        },
        createdByUserId: user.id,
      });
    }
    return saved;
  }

  async editDelivery(
    user: { id: string; role: UserRole },
    id: string,
    dto: EditDeliveryDto,
  ) {
    if (
      dto.finalDeliveredQuantity == null &&
      dto.staffExtraQuantity == null &&
      dto.deliveryNotes == null
    ) {
      throw new BadRequestException('Nothing to edit');
    }
    if (
      dto.editReason === DeliveryEditReason.OTHER &&
      (!dto.editNote || !dto.editNote.trim())
    ) {
      throw new BadRequestException(
        'editNote is required when reason is OTHER',
      );
    }

    const delivery = await this.getAccessibleDelivery(user, id);
    if (delivery.status !== DeliveryStatus.DELIVERED) {
      throw new BadRequestException('Only delivered deliveries can be edited');
    }

    await this.assertEditableByMembership(user, delivery);
    await this.assertNotOnFinalizedBill(delivery.id);

    const isStaff = user.role === UserRole.DELIVERY_STAFF;
    if (isStaff) {
      if (delivery.assignedUserId !== user.id) {
        throw new ForbiddenException(
          'You can only edit deliveries assigned to you',
        );
      }
      this.assertWithinEditWindow(delivery);
    }

    const previousQuantity =
      delivery.finalDeliveredQuantity ?? delivery.quantity;
    const previousStaffExtra = delivery.staffExtraQuantity || '0';
    const previousCustomerExtra = delivery.customerExtraQuantity || '0';
    const previousTotalExtra = roundQty(
      new Decimal(previousCustomerExtra).plus(previousStaffExtra).toString(),
    );
    const previousAmount = delivery.amount;

    let staffExtra = previousStaffExtra;
    let finalQty: string;

    if (dto.finalDeliveredQuantity != null) {
      // Final poured amount is source of truth; derive staff extra from it.
      finalQty = roundQty(dto.finalDeliveredQuantity);
      staffExtra = staffExtraFromFinal({
        finalDeliveredQuantity: finalQty,
        scheduledQuantity: delivery.scheduledQuantity,
        customerExtraQuantity: delivery.customerExtraQuantity,
      });
    } else if (dto.staffExtraQuantity != null) {
      staffExtra = roundQty(dto.staffExtraQuantity);
      if (new Decimal(staffExtra).lt(0)) {
        throw new BadRequestException('Staff extra cannot be negative');
      }
      finalQty = expectedQuantity({
        scheduledQuantity: delivery.scheduledQuantity,
        customerExtraQuantity: delivery.customerExtraQuantity,
        staffExtraQuantity: staffExtra,
      });
    } else {
      finalQty = previousQuantity;
    }

    if (new Decimal(finalQty).lte(0)) {
      throw new BadRequestException('Delivered quantity must be > 0');
    }

    const newAmount = amountForQuantity(finalQty, delivery.ratePerLitre);
    const newTotalExtra = roundQty(
      new Decimal(previousCustomerExtra).plus(staffExtra).toString(),
    );

    delivery.staffExtraQuantity = staffExtra;
    delivery.finalDeliveredQuantity = finalQty;
    delivery.quantity = finalQty;
    delivery.amount = newAmount;
    if (dto.deliveryNotes != null) {
      delivery.deliveryNotes = dto.deliveryNotes;
    }
    delivery.isEdited = true;
    delivery.lastEditedAt = new Date();
    delivery.lastEditedByUserId = user.id;
    delivery.editReviewStatus = DeliveryEditReviewStatus.PENDING_REVIEW;
    delivery.version += 1;

    const saved = await this.deliveriesRepo.save(delivery);

    const history = await this.editHistoryRepo.save(
      this.editHistoryRepo.create({
        deliveryId: saved.id,
        editedByUserId: user.id,
        editedByRole: user.role,
        previousQuantity,
        newQuantity: finalQty,
        previousExtraQuantity: previousTotalExtra,
        newExtraQuantity: newTotalExtra,
        previousStaffExtraQuantity: previousStaffExtra,
        newStaffExtraQuantity: staffExtra,
        previousAmount,
        newAmount,
        editReason: dto.editReason,
        editNote: dto.editNote?.trim() || null,
      }),
    );

    const reasonText = editReasonLabel(dto.editReason);
    const noteSuffix = dto.editNote?.trim() ? ` — ${dto.editNote.trim()}` : '';
    await this.recordEvent({
      delivery: saved,
      eventType: DeliveryEventType.DELIVERY_EDITED,
      actor: user,
      previousStatus: DeliveryStatus.DELIVERED,
      newStatus: DeliveryStatus.DELIVERED,
      quantity: finalQty,
      notes: `${formatQtyDisplay(previousQuantity)} L → ${formatQtyDisplay(finalQty)} L. Reason: ${reasonText}${noteSuffix}`,
    });

    await this.auditService.log({
      actorUserId: user.id,
      supplierId: saved.supplierId,
      entityType: 'DELIVERY',
      entityId: saved.id,
      action: 'DELIVERY_EDITED',
      oldValues: {
        finalDeliveredQuantity: previousQuantity,
        staffExtraQuantity: previousStaffExtra,
        amount: previousAmount,
      },
      newValues: {
        finalDeliveredQuantity: finalQty,
        staffExtraQuantity: staffExtra,
        amount: newAmount,
        editReason: dto.editReason,
        historyId: history.id,
      },
    });

    await this.notifyOwnersOfEdit(saved, user, {
      previousQuantity,
      newQuantity: finalQty,
      previousAmount,
      newAmount,
      previousStaffExtra,
      newStaffExtra: staffExtra,
      reasonText,
      editNote: dto.editNote?.trim() || null,
    });

    return { delivery: saved, history };
  }

  async confirmEditReview(
    user: { id: string; role: UserRole },
    id: string,
    dto: EditReviewDto,
  ) {
    return this.resolveEditReview(
      user,
      id,
      DeliveryEditReviewStatus.CONFIRMED,
      DeliveryEventType.EDIT_REVIEW_CONFIRMED,
      NotificationType.DELIVERY_EDIT_CONFIRMED,
      'Delivery Edit Confirmed',
      dto,
    );
  }

  async flagEditReview(
    user: { id: string; role: UserRole },
    id: string,
    dto: EditReviewDto,
  ) {
    return this.resolveEditReview(
      user,
      id,
      DeliveryEditReviewStatus.FLAGGED,
      DeliveryEventType.EDIT_REVIEW_FLAGGED,
      NotificationType.DELIVERY_EDIT_FLAGGED,
      'Delivery Edit Flagged',
      dto,
    );
  }

  async getEditReviewDetail(user: { id: string; role: UserRole }, id: string) {
    const delivery = await this.getAccessibleDelivery(user, id);
    if (
      user.role !== UserRole.FARM_OWNER &&
      user.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException('Farm owner review only');
    }
    const history = await this.editHistoryRepo.find({
      where: { deliveryId: id },
      order: { editedAt: 'DESC' },
      relations: ['editedByUser'],
    });
    const events = await this.eventsRepo.find({
      where: { deliveryId: id },
      order: { createdAt: 'ASC' },
    });
    const latest = history[0] ?? null;
    const staffUserId =
      latest?.editedByUserId ??
      delivery.lastEditedByUserId ??
      delivery.deliveredByUserId;
    const staff = staffUserId
      ? await this.usersRepo.findOne({ where: { id: staffUserId } })
      : null;
    return {
      delivery,
      customer: delivery.customer,
      latestEdit: latest,
      editHistory: history,
      events,
      deliveryStaff: staff
        ? {
            id: staff.id,
            name: staff.name,
            mobileNumber: staff.mobileNumber,
          }
        : null,
    };
  }

  async listEditedToday(user: { id: string; role: UserRole }, farmId?: string) {
    if (
      user.role !== UserRole.FARM_OWNER &&
      user.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException('Farm owner access required');
    }
    const today = todayIso();
    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'customer')
      .where('d.delivery_date = :today', { today })
      .andWhere('d.is_edited = true')
      .orderBy('d.last_edited_at', 'DESC');
    if (user.role === UserRole.FARM_OWNER) {
      qb.andWhere('d.supplier_id = :sid', { sid: user.id });
    }
    if (farmId) {
      qb.andWhere('d.farm_id = :farmId', { farmId });
    }
    return qb.getMany();
  }

  async skip(
    user: { id: string; role: UserRole },
    id: string,
    dto: SkipCancelFailDto,
  ) {
    const delivery = await this.getAccessibleDelivery(user, id);
    const note =
      dto.notes?.trim() ||
      `Farm: delivery not possible on ${delivery.deliveryDate}`;
    const saved = await this.closeAs(
      user,
      id,
      DeliveryStatus.SKIPPED,
      DeliveryEventType.SKIPPED,
      { notes: note },
    );
    await this.notifyCustomerFarmNoDelivery(saved, note);
    return saved;
  }

  /**
   * Farm marks today (or a date) as not deliverable — one customer or all open stops.
   */
  async farmSkipToday(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: FarmSkipTodayDto,
  ) {
    const farm = assertFound(
      await this.farmsRepo.findOne({ where: { id: farmId } }),
      'Farm not found',
    );
    if (user.role === UserRole.FARM_OWNER && farm.createdByUserId !== user.id) {
      throw new ForbiddenException('Not your farm');
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      const member = await this.membersRepo.findOne({
        where: {
          farmId,
          userId: user.id,
          status: FarmMemberStatus.ACTIVE,
        },
      });
      if (!member) throw new ForbiddenException('Not a member of this farm');
    } else if (
      user.role !== UserRole.FARM_OWNER &&
      user.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException('Farm action only');
    }

    const date = dto.date || todayIso();
    const note =
      dto.notes?.trim() || `Farm: delivery not possible on ${date}`;
    const rows = await this.deliveriesRepo.find({
      where: {
        farmId,
        deliveryDate: date,
        status: In([
          DeliveryStatus.PENDING,
          DeliveryStatus.OUT_FOR_DELIVERY,
        ]),
        ...(dto.customerId ? { customerId: dto.customerId } : {}),
      },
      relations: ['subscription'],
    });

    const actionable =
      user.role === UserRole.DELIVERY_STAFF
        ? rows.filter(
            (r) =>
              r.assignedUserId === user.id ||
              r.subscription?.assignedDeliveryUserId === user.id,
          )
        : rows;

    let skipped = 0;
    for (const row of actionable) {
      await this.skip(user, row.id, { notes: note });
      skipped += 1;
    }
    return { date, skipped, customerId: dto.customerId ?? null };
  }

  async cancel(
    user: { id: string; role: UserRole },
    id: string,
    dto: SkipCancelFailDto,
  ) {
    return this.closeAs(
      user,
      id,
      DeliveryStatus.CANCELLED,
      DeliveryEventType.CANCELLED,
      dto,
    );
  }

  async fail(
    user: { id: string; role: UserRole },
    id: string,
    dto: SkipCancelFailDto,
  ) {
    return this.closeAs(
      user,
      id,
      DeliveryStatus.FAILED,
      DeliveryEventType.FAILED,
      dto,
    );
  }

  async customerSkipToday(
    user: { id: string; role: UserRole },
    id: string,
    dto: SkipCancelFailDto,
    opts?: { silent?: boolean },
  ) {
    const delivery = await this.requireCustomerDelivery(user, id);
    if (delivery.status === DeliveryStatus.SKIPPED) {
      return delivery;
    }
    if (
      ![DeliveryStatus.PENDING, DeliveryStatus.OUT_FOR_DELIVERY].includes(
        delivery.status,
      )
    ) {
      throw new BadRequestException(
        'Too late to cancel — this delivery is already closed',
      );
    }

    const previous = delivery.status;
    delivery.status = DeliveryStatus.SKIPPED;
    delivery.customerExtraQuantity = roundQty(0);
    delivery.staffExtraQuantity = roundQty(0);
    delivery.finalDeliveredQuantity = roundQty(0);
    delivery.quantity = roundQty(0);
    delivery.amount = amountForQuantity('0', delivery.ratePerLitre);
    const note = dto.notes?.trim() || `Customer: no milk on ${delivery.deliveryDate}`;
    delivery.deliveryNotes = [delivery.deliveryNotes, note]
      .filter(Boolean)
      .join('\n');
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);
    await this.recordEvent({
      delivery: saved,
      eventType: DeliveryEventType.SKIPPED,
      actor: user,
      previousStatus: previous,
      newStatus: DeliveryStatus.SKIPPED,
      notes: note,
    });

    if (!opts?.silent) {
      const customerName = delivery.customer?.name ?? 'Customer';
      const isToday = delivery.deliveryDate === todayIso();
      await this.notifyFarmAndStaff(saved, {
        type: NotificationType.CUSTOMER_NO_MILK_TODAY,
        title: isToday ? 'No milk today' : 'No milk for a day',
        body: isToday
          ? `${customerName} does not want milk today.`
          : `${customerName} does not want milk on ${delivery.deliveryDate}.`,
        messageKey: isToday ? 'notifCustomerNoMilkToday' : 'notifCustomerNoMilk',
        params: { name: customerName, date: delivery.deliveryDate },
        route: '/farm/today',
      });
    }
    return saved;
  }

  /**
   * Skip milk for a calendar day — works even if the farm has not generated
   * the daily list yet (creates SKIPPED stubs so generate won't reopen PENDING).
   * At most one open/skipped row is kept per farm + shift + day for this user.
   */
  async customerSkipDay(
    user: { id: string; role: UserRole },
    dto: CustomerSkipDayDto,
  ) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Customer action only');
    }
    const date = dto.date;
    const today = todayIso();
    if (date < today) {
      throw new BadRequestException('Cannot skip a past day');
    }

    const customers = await this.deliveriesRepo.manager.find(Customer, {
      where: { customerUserId: user.id },
    });
    if (customers.length === 0) {
      throw new BadRequestException('No customer profile linked to this account');
    }
    const customerIds = customers.map((c) => c.id);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const note = dto.notes?.trim() || `Customer: no milk on ${date}`;

    const open = await this.deliveriesRepo.find({
      where: {
        customerId: In(customerIds),
        deliveryDate: date,
        status: In([
          DeliveryStatus.PENDING,
          DeliveryStatus.OUT_FOR_DELIVERY,
        ]),
      },
      relations: ['customer'],
    });
    let skipped = 0;
    let notifySample: MilkDelivery | null = null;
    let notifyCustomerName = 'Customer';
    const covered = new Set<string>();
    // Skip open rows without per-delivery farm push — one notify at the end.
    for (const row of open) {
      await this.customerSkipToday(
        user,
        row.id,
        { notes: note },
        { silent: true },
      );
      skipped += 1;
      notifySample = row;
      notifyCustomerName = row.customer?.name ?? notifyCustomerName;
      covered.add(`${row.farmId}|${row.deliveryShift}`);
    }

    const subs = await this.subsRepo.find({
      where: {
        customerId: In(customerIds),
        status: SubscriptionStatus.ACTIVE,
      },
    });
    const productIds = [
      ...new Set(
        subs
          .map((s) => s.farmProductId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const products = productIds.length
      ? await this.deliveriesRepo.manager.find(FarmMilkProduct, {
          where: { id: In(productIds) },
        })
      : [];
    const rateByProductId = new Map(
      products.map((p) => [p.id, p.currentRatePerLitre]),
    );

    for (const sub of subs) {
      if (!isDeliveryRequiredOnDate(sub, date)) continue;
      const coverKey = `${sub.farmId}|${sub.deliveryShift}`;
      if (covered.has(coverKey)) continue;

      // One row per farm+shift+day for this account (avoids duplicate customer profiles).
      const existing = await this.deliveriesRepo
        .createQueryBuilder('d')
        .where('d.farm_id = :farmId', { farmId: sub.farmId })
        .andWhere('d.delivery_date = :date', { date })
        .andWhere('d.delivery_shift = :shift', { shift: sub.deliveryShift })
        .andWhere('d.customer_id IN (:...customerIds)', { customerIds })
        .andWhere('d.status != :cancelled', {
          cancelled: DeliveryStatus.CANCELLED,
        })
        .getOne();
      if (existing) {
        covered.add(coverKey);
        continue;
      }

      const customer = customerById.get(sub.customerId);
      const scheduled = roundQty(sub.defaultQuantity);
      const ratePerLitre = roundMoney(
        (sub.farmProductId && rateByProductId.get(sub.farmProductId)) ||
          sub.ratePerLitre,
      );
      const saved = await this.deliveriesRepo.save(
        this.deliveriesRepo.create({
          supplierId: sub.supplierId,
          farmId: sub.farmId,
          customerId: sub.customerId,
          customerUserId: customer?.customerUserId ?? user.id,
          customerAddressId: sub.customerAddressId,
          farmProductId: sub.farmProductId,
          assignedUserId: sub.assignedDeliveryUserId,
          subscriptionId: sub.id,
          deliveryDate: date,
          deliveryShift: sub.deliveryShift,
          quantity: roundQty(0),
          scheduledQuantity: scheduled,
          customerExtraQuantity: roundQty(0),
          staffExtraQuantity: roundQty(0),
          finalDeliveredQuantity: roundQty(0),
          ratePerLitre,
          amount: amountForQuantity('0', ratePerLitre),
          status: DeliveryStatus.SKIPPED,
          confirmationStatus: DeliveryConfirmationStatus.NOT_CONFIRMED,
          deliveryNotes: note,
          clientReferenceId: uuidv4(),
          version: 1,
          createdByUserId: user.id,
        }),
      );
      await this.recordEvent({
        delivery: saved,
        eventType: DeliveryEventType.SKIPPED,
        actor: user,
        previousStatus: DeliveryStatus.PENDING,
        newStatus: DeliveryStatus.SKIPPED,
        notes: note,
      });
      skipped += 1;
      covered.add(coverKey);
      notifySample = saved;
      notifyCustomerName = customer?.name ?? notifyCustomerName;
    }

    await this.collapseDuplicateCustomerDayRows(customerIds, date);

    if (skipped === 0) {
      // Already cancelled earlier, or no subscription due that day.
      const already = await this.deliveriesRepo.count({
        where: {
          customerId: In(customerIds),
          deliveryDate: date,
          status: DeliveryStatus.SKIPPED,
        },
      });
      if (already > 0) {
        await this.collapseDuplicateCustomerDayRows(customerIds, date);
        return { date, skipped: already, alreadySkipped: true };
      }
      throw new BadRequestException(
        'No milk subscription due on that day to cancel',
      );
    }

    if (notifySample) {
      await this.notifyFarmAndStaff(notifySample, {
        type: NotificationType.CUSTOMER_NO_MILK_TODAY,
        title: date === today ? 'No milk today' : 'No milk for a day',
        body:
          date === today
            ? `${notifyCustomerName} does not want milk today.`
            : `${notifyCustomerName} does not want milk on ${date}.`,
        messageKey:
          date === today ? 'notifCustomerNoMilkToday' : 'notifCustomerNoMilk',
        params: { name: notifyCustomerName, date },
        route: '/farm/today',
      });
    }
    return { date, skipped: 1 };
  }

  /**
   * Customer changed mind — restore SKIPPED “no milk” rows for that day to PENDING.
   */
  async customerUnskipDay(
    user: { id: string; role: UserRole },
    dto: CustomerSkipDayDto,
  ) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Customer action only');
    }
    const date = dto.date;
    const today = todayIso();
    if (date < today) {
      throw new BadRequestException('Cannot change a past day');
    }

    const customers = await this.deliveriesRepo.manager.find(Customer, {
      where: { customerUserId: user.id },
    });
    if (customers.length === 0) {
      throw new BadRequestException('No customer profile linked to this account');
    }
    const customerIds = customers.map((c) => c.id);
    const note = dto.notes?.trim() || `Customer: wants milk again on ${date}`;

    const rows = await this.deliveriesRepo.find({
      where: {
        customerId: In(customerIds),
        deliveryDate: date,
        status: DeliveryStatus.SKIPPED,
      },
      relations: ['customer'],
    });
    const customerSkipped = rows.filter((r) =>
      (r.deliveryNotes ?? '').includes('Customer:'),
    );
    if (customerSkipped.length === 0) {
      throw new BadRequestException('No skipped milk day to restore for that date');
    }

    let restored = 0;
    let notifySample: MilkDelivery | null = null;
    let notifyCustomerName = 'Customer';
    for (const delivery of customerSkipped) {
      const previous = delivery.status;
      const scheduled = roundQty(delivery.scheduledQuantity || '0');
      delivery.status = DeliveryStatus.PENDING;
      delivery.customerExtraQuantity = roundQty(0);
      delivery.staffExtraQuantity = roundQty(0);
      delivery.finalDeliveredQuantity = null;
      delivery.quantity = scheduled;
      delivery.amount = amountForQuantity(scheduled, delivery.ratePerLitre);
      delivery.confirmationStatus = DeliveryConfirmationStatus.NOT_CONFIRMED;
      const cleaned = (delivery.deliveryNotes ?? '')
        .split('\n')
        .filter((line) => !line.includes('Customer: no milk'))
        .join('\n')
        .trim();
      delivery.deliveryNotes = [cleaned, note].filter(Boolean).join('\n');
      delivery.version += 1;
      const saved = await this.deliveriesRepo.save(delivery);
      await this.recordEvent({
        delivery: saved,
        eventType: DeliveryEventType.RESOLVED,
        actor: user,
        previousStatus: previous,
        newStatus: DeliveryStatus.PENDING,
        notes: note,
        quantity: scheduled,
      });
      restored += 1;
      notifySample = saved;
      notifyCustomerName = delivery.customer?.name ?? notifyCustomerName;
    }

    await this.collapseDuplicateCustomerDayRows(customerIds, date);

    if (notifySample) {
      await this.notifyFarmAndStaff(notifySample, {
        type: NotificationType.GENERIC,
        title: date === today ? 'Wants milk today' : 'Wants milk again',
        body:
          date === today
            ? `${notifyCustomerName} wants milk today again.`
            : `${notifyCustomerName} wants milk on ${date} again.`,
        messageKey:
          date === today
            ? 'notifCustomerWantsMilkToday'
            : 'notifCustomerWantsMilk',
        params: { name: notifyCustomerName, date },
        route: '/farm/today',
      });
    }
    return { date, restored };
  }

  /** Keep one live row per farm+shift+day for this customer account; cancel extras. */
  private async collapseDuplicateCustomerDayRows(
    customerIds: string[],
    date: string,
  ) {
    const rows = await this.deliveriesRepo.find({
      where: {
        customerId: In(customerIds),
        deliveryDate: date,
      },
      order: { createdAt: 'ASC' },
    });
    const groups = new Map<string, MilkDelivery[]>();
    for (const row of rows) {
      if (row.status === DeliveryStatus.CANCELLED) continue;
      const key = `${row.farmId}|${row.deliveryShift}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const keep =
        list.find(
          (r) =>
            r.status === DeliveryStatus.SKIPPED &&
            (r.deliveryNotes ?? '').includes('Customer:'),
        ) ??
        list.find((r) => r.status === DeliveryStatus.PENDING) ??
        list[0];
      for (const row of list) {
        if (row.id === keep.id) continue;
        row.status = DeliveryStatus.CANCELLED;
        row.deliveryNotes = [row.deliveryNotes, 'Duplicate day row collapsed']
          .filter(Boolean)
          .join('\n');
        row.version += 1;
        await this.deliveriesRepo.save(row);
      }
    }
  }

  async customerConfirm(
    user: { id: string; role: UserRole },
    id: string,
    dto: CustomerConfirmDto,
  ) {
    const delivery = await this.requireCustomerDelivery(user, id);
    if (
      delivery.confirmationStatus ===
      DeliveryConfirmationStatus.CUSTOMER_CONFIRMED
    ) {
      return delivery;
    }
    const previous = delivery.status;
    delivery.confirmationStatus = DeliveryConfirmationStatus.CUSTOMER_CONFIRMED;
    if (delivery.status !== DeliveryStatus.DELIVERED) {
      delivery.status = DeliveryStatus.DELIVERED;
      delivery.finalDeliveredQuantity =
        delivery.finalDeliveredQuantity ??
        expectedQuantity({
          scheduledQuantity: delivery.scheduledQuantity,
          customerExtraQuantity: delivery.customerExtraQuantity,
          staffExtraQuantity: delivery.staffExtraQuantity,
        });
      delivery.quantity = delivery.finalDeliveredQuantity;
      delivery.amount = amountForQuantity(
        delivery.finalDeliveredQuantity,
        delivery.ratePerLitre,
      );
      delivery.deliveredAt = delivery.deliveredAt ?? new Date();
    }
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);
    await this.recordEvent({
      delivery: saved,
      eventType: DeliveryEventType.CUSTOMER_CONFIRMED,
      actor: user,
      previousStatus: previous,
      newStatus: saved.status,
      notes: dto.notes ?? null,
    });
    await this.notifyFarmAndStaff(saved, {
      type: NotificationType.CUSTOMER_CONFIRMED_DELIVERY,
      title: 'Delivery confirmed',
      body: 'Customer confirmed milk was received.',
      messageKey: 'notifCustomerConfirmed',
    });
    return saved;
  }

  async customerMarkReceived(
    user: { id: string; role: UserRole },
    id: string,
    dto: CustomerConfirmDto,
  ) {
    const delivery = await this.requireCustomerDelivery(user, id);
    if (
      delivery.confirmationStatus ===
        DeliveryConfirmationStatus.CUSTOMER_MARKED_RECEIVED ||
      delivery.confirmationStatus ===
        DeliveryConfirmationStatus.CUSTOMER_CONFIRMED
    ) {
      return delivery;
    }
    if (
      delivery.status === DeliveryStatus.DELIVERED &&
      delivery.confirmationStatus ===
        DeliveryConfirmationStatus.FARM_MARKED_DELIVERED
    ) {
      // Staff already marked — treat as confirm rather than override.
      return this.customerConfirm(user, id, dto);
    }
    if (
      delivery.status === DeliveryStatus.SKIPPED ||
      delivery.status === DeliveryStatus.CANCELLED ||
      delivery.status === DeliveryStatus.FAILED
    ) {
      throw new BadRequestException(
        'Cannot mark received for a closed non-delivery',
      );
    }
    const previous = delivery.status;
    const finalQty = expectedQuantity({
      scheduledQuantity: delivery.scheduledQuantity,
      customerExtraQuantity: delivery.customerExtraQuantity,
      staffExtraQuantity: delivery.staffExtraQuantity,
    });
    delivery.status = DeliveryStatus.DELIVERED;
    delivery.confirmationStatus =
      DeliveryConfirmationStatus.CUSTOMER_MARKED_RECEIVED;
    delivery.finalDeliveredQuantity = finalQty;
    delivery.quantity = finalQty;
    delivery.amount = amountForQuantity(finalQty, delivery.ratePerLitre);
    delivery.deliveredAt = new Date();
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);
    await this.recordEvent({
      delivery: saved,
      eventType: DeliveryEventType.CUSTOMER_MARKED_RECEIVED,
      actor: user,
      previousStatus: previous,
      newStatus: saved.status,
      quantity: finalQty,
      notes: dto.notes ?? null,
    });
    await this.notifyFarmAndStaff(saved, {
      type: NotificationType.CUSTOMER_MARKED_RECEIVED,
      title: 'Customer marked milk received',
      body: 'Customer marked today’s milk as received.',
      messageKey: 'notifCustomerMarkedReceived',
    });
    return saved;
  }

  /**
   * Create today's delivery for a subscription that was not scheduled
   * (or ensure it exists), then apply staff-added extra milk.
   */
  async createAdHocExtraDelivery(
    user: { id: string; role: UserRole },
    dto: CreateAdHocExtraDeliveryDto,
  ) {
    const sub = assertFound(
      await this.subsRepo.findOne({ where: { id: dto.subscriptionId } }),
      'Subscription not found',
    );
    if (sub.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException('Subscription is not active');
    }
    if (user.role === UserRole.FARM_OWNER && sub.supplierId !== user.id) {
      throw new ForbiddenException('Not your subscription');
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      const assignedDirectly = sub.assignedDeliveryUserId === user.id;
      const assignment = assignedDirectly
        ? null
        : await this.assignmentsRepo.findOne({
            where: {
              subscriptionId: sub.id,
              assigneeUserId: user.id,
              status: DeliveryAssignmentStatus.ACTIVE,
            },
          });
      if (!assignedDirectly && !assignment) {
        throw new ForbiddenException('Subscription not assigned to you');
      }
    }

    const date = todayIso();
    let delivery = await this.deliveriesRepo.findOne({
      where: {
        subscriptionId: sub.id,
        deliveryDate: date,
        deliveryShift: sub.deliveryShift,
      },
      relations: ['customer', 'subscription'],
    });

    if (!delivery) {
      const customer = await this.deliveriesRepo.manager.findOne(Customer, {
        where: { id: sub.customerId },
      });
      let ratePerLitre = roundMoney(sub.ratePerLitre);
      if (sub.farmProductId) {
        const product = await this.deliveriesRepo.manager.findOne(
          FarmMilkProduct,
          { where: { id: sub.farmProductId } },
        );
        if (product?.currentRatePerLitre) {
          ratePerLitre = roundMoney(product.currentRatePerLitre);
        }
      }
      delivery = await this.deliveriesRepo.save(
        this.deliveriesRepo.create({
          supplierId: sub.supplierId,
          farmId: sub.farmId,
          customerId: sub.customerId,
          customerUserId: customer?.customerUserId ?? null,
          customerAddressId: sub.customerAddressId,
          farmProductId: sub.farmProductId,
          assignedUserId: sub.assignedDeliveryUserId,
          subscriptionId: sub.id,
          deliveryDate: date,
          deliveryShift: sub.deliveryShift,
          quantity: roundQty(0),
          scheduledQuantity: roundQty(0),
          customerExtraQuantity: roundQty(0),
          staffExtraQuantity: roundQty(0),
          finalDeliveredQuantity: null,
          ratePerLitre,
          amount: amountForQuantity('0', ratePerLitre),
          status: DeliveryStatus.PENDING,
          confirmationStatus: DeliveryConfirmationStatus.NOT_CONFIRMED,
          clientReferenceId: uuidv4(),
          version: 1,
          createdByUserId: user.id,
        }),
      );
      await this.eventsRepo.save(
        this.eventsRepo.create({
          deliveryId: delivery.id,
          eventType: DeliveryEventType.CREATED,
          actorUserId: user.id,
          actorRole: user.role,
          newStatus: delivery.status,
          quantity: roundQty(0),
          notes: 'Ad-hoc extra delivery (no scheduled milk today)',
        }),
      );
      delivery = await this.getAccessibleDelivery(user, delivery.id);
    } else {
      await this.assertCanAccess(user, delivery);
    }

    return this.addStaffExtra(user, delivery.id, {
      extraQuantity: dto.extraQuantity,
      reason: dto.reason,
    });
  }

  async listOpenIssues(user: { id: string; role: UserRole }) {
    const qb = this.issuesRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.delivery', 'd')
      .where('i.status IN (:...statuses)', {
        statuses: [DeliveryIssueStatus.OPEN, DeliveryIssueStatus.UNDER_REVIEW],
      })
      .orderBy('i.created_at', 'DESC')
      .take(100);

    if (user.role === UserRole.DELIVERY_STAFF) {
      qb.andWhere(
        '(d.assigned_user_id = :uid OR d.subscription_id IN ' +
          '(SELECT s.id FROM milk_subscriptions s WHERE s.assigned_delivery_user_id = :uid))',
        { uid: user.id },
      );
    } else if (user.role === UserRole.FARM_OWNER) {
      qb.andWhere('d.supplier_id = :uid', { uid: user.id });
    }

    return qb.getMany();
  }

  async resolveIssue(
    user: { id: string; role: UserRole },
    issueId: string,
    dto: ResolveDeliveryIssueDto,
  ) {
    if (
      user.role !== UserRole.FARM_OWNER &&
      user.role !== UserRole.DELIVERY_STAFF &&
      user.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException();
    }

    const issue = assertFound(
      await this.issuesRepo.findOne({ where: { id: issueId } }),
      'Issue not found',
    );
    const delivery = await this.getAccessibleDelivery(user, issue.deliveryId);

    if (
      issue.status === DeliveryIssueStatus.RESOLVED ||
      issue.status === DeliveryIssueStatus.DISMISSED
    ) {
      throw new BadRequestException('Issue already closed');
    }

    const restore =
      (dto.restoreStatus as DeliveryStatus | undefined) ??
      DeliveryStatus.DELIVERED;
    if (
      ![
        DeliveryStatus.DELIVERED,
        DeliveryStatus.SKIPPED,
        DeliveryStatus.CANCELLED,
        DeliveryStatus.FAILED,
      ].includes(restore)
    ) {
      throw new BadRequestException('Invalid restore status');
    }

    const previous = delivery.status;
    delivery.status = restore;
    if (restore === DeliveryStatus.DELIVERED) {
      delivery.confirmationStatus =
        DeliveryConfirmationStatus.FARM_MARKED_DELIVERED;
      if (!delivery.finalDeliveredQuantity) {
        const qty = expectedQuantity({
          scheduledQuantity: delivery.scheduledQuantity,
          customerExtraQuantity: delivery.customerExtraQuantity,
          staffExtraQuantity: delivery.staffExtraQuantity,
        });
        delivery.finalDeliveredQuantity = qty;
        delivery.quantity = qty;
        delivery.amount = amountForQuantity(qty, delivery.ratePerLitre);
      }
      delivery.deliveredAt = delivery.deliveredAt ?? new Date();
    }
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);

    issue.status = DeliveryIssueStatus.RESOLVED;
    issue.resolutionNotes = dto.resolutionNotes ?? null;
    issue.resolvedByUserId = user.id;
    issue.resolvedAt = new Date();
    await this.issuesRepo.save(issue);

    await this.recordEvent({
      delivery: saved,
      eventType: DeliveryEventType.RESOLVED,
      actor: user,
      previousStatus: previous,
      newStatus: saved.status,
      notes: dto.resolutionNotes ?? null,
    });

    if (saved.customerUserId) {
      await this.notifications.notify({
        type: NotificationType.DELIVERY_ISSUE_RESOLVED,
        title: 'Delivery issue resolved',
        body: dto.resolutionNotes || 'Your delivery issue has been resolved.',
        messageKey: 'notifIssueResolved',
        params: {
          notes: dto.resolutionNotes || 'Your delivery issue has been resolved.',
        },
        recipientUserIds: [saved.customerUserId],
        route: `/customer/deliveries/${saved.id}`,
        farmId: saved.farmId,
        entityType: 'DELIVERY',
        entityId: saved.id,
        data: { deliveryId: saved.id, issueId: issue.id },
        createdByUserId: user.id,
      });
    }

    return { issue, delivery: saved };
  }

  async customerReportIssue(
    user: { id: string; role: UserRole },
    id: string,
    dto: CustomerIssueDto,
  ) {
    const delivery = await this.requireCustomerDelivery(user, id);
    const previous = delivery.status;
    const isNotReceived = dto.issueType === DeliveryIssueType.NOT_RECEIVED;
    const isWrongQty = dto.issueType === DeliveryIssueType.WRONG_QUANTITY;

    delivery.status = DeliveryStatus.DISPUTED;
    delivery.confirmationStatus = isNotReceived
      ? DeliveryConfirmationStatus.CUSTOMER_REPORTED_NOT_RECEIVED
      : isWrongQty
        ? DeliveryConfirmationStatus.CUSTOMER_REPORTED_WRONG_QUANTITY
        : DeliveryConfirmationStatus.DISPUTED;
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);

    await this.issuesRepo.save(
      this.issuesRepo.create({
        deliveryId: saved.id,
        farmId: saved.farmId,
        reportedByUserId: user.id,
        issueType: dto.issueType,
        status: DeliveryIssueStatus.OPEN,
        description: dto.description ?? null,
      }),
    );

    const eventType = isNotReceived
      ? DeliveryEventType.CUSTOMER_REPORTED_NOT_RECEIVED
      : isWrongQty
        ? DeliveryEventType.CUSTOMER_REPORTED_WRONG_QUANTITY
        : DeliveryEventType.DISPUTED;

    await this.recordEvent({
      delivery: saved,
      eventType,
      actor: user,
      previousStatus: previous,
      newStatus: saved.status,
      notes: dto.description ?? null,
    });

    await this.notifyFarmAndStaff(saved, {
      type: isNotReceived
        ? NotificationType.CUSTOMER_REPORTED_NOT_RECEIVED
        : NotificationType.WRONG_QUANTITY_REPORTED,
      title: 'Delivery issue reported',
      body: dto.description || `Customer reported: ${dto.issueType}`,
      messageKey: 'notifIssueReported',
      params: {
        notes: dto.description || `Customer reported: ${dto.issueType}`,
      },
    });
    return saved;
  }

  private async closeAs(
    user: { id: string; role: UserRole },
    id: string,
    status: DeliveryStatus,
    eventType: DeliveryEventType,
    dto: SkipCancelFailDto,
  ) {
    const delivery = await this.getAccessibleDelivery(user, id);
    if (
      ![DeliveryStatus.PENDING, DeliveryStatus.OUT_FOR_DELIVERY].includes(
        delivery.status,
      )
    ) {
      throw new BadRequestException(`Cannot set status to ${status}`);
    }
    const previous = delivery.status;
    delivery.status = status;
    delivery.finalDeliveredQuantity = roundQty(0);
    delivery.quantity = roundQty(0);
    delivery.amount = amountForQuantity('0', delivery.ratePerLitre);
    if (dto.notes) delivery.deliveryNotes = dto.notes;
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);
    await this.recordEvent({
      delivery: saved,
      eventType,
      actor: user,
      previousStatus: previous,
      newStatus: status,
      notes: dto.notes ?? null,
    });
    return saved;
  }

  private syncExpected(delivery: MilkDelivery) {
    const expected = expectedQuantity({
      scheduledQuantity: delivery.scheduledQuantity,
      customerExtraQuantity: delivery.customerExtraQuantity,
      staffExtraQuantity: delivery.staffExtraQuantity,
    });
    delivery.quantity = expected;
    delivery.amount = amountForQuantity(expected, delivery.ratePerLitre);
  }

  private async transition(
    user: { id: string; role: UserRole },
    delivery: MilkDelivery,
    opts: {
      status: DeliveryStatus;
      eventType: DeliveryEventType;
      notify?: (d: MilkDelivery) => Promise<void>;
    },
  ) {
    const previous = delivery.status;
    delivery.status = opts.status;
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);
    await this.recordEvent({
      delivery: saved,
      eventType: opts.eventType,
      actor: user,
      previousStatus: previous,
      newStatus: opts.status,
    });
    if (opts.notify) await opts.notify(saved);
    return saved;
  }

  private async recordEvent(input: {
    delivery: MilkDelivery;
    eventType: DeliveryEventType;
    actor: { id: string; role: UserRole };
    previousStatus: string;
    newStatus: string;
    quantity?: string | null;
    notes?: string | null;
  }) {
    await this.eventsRepo.save(
      this.eventsRepo.create({
        deliveryId: input.delivery.id,
        eventType: input.eventType,
        actorUserId: input.actor.id,
        actorRole: input.actor.role,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        quantity: input.quantity ?? null,
        notes: input.notes ?? null,
      }),
    );
  }

  private async requireCustomerDelivery(
    user: { id: string; role: UserRole },
    id: string,
  ) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Customer action only');
    }
    const delivery = assertFound(
      await this.deliveriesRepo.findOne({
        where: { id },
        relations: ['customer'],
      }),
      'Delivery not found',
    );
    if (delivery.customerUserId !== user.id) {
      throw new ForbiddenException('Not your delivery');
    }
    return delivery;
  }

  private async assertCanAccess(
    user: { id: string; role: UserRole },
    delivery: MilkDelivery,
  ) {
    if (user.role === UserRole.PLATFORM_OWNER) return;
    if (user.role === UserRole.FARM_OWNER && user.id === delivery.supplierId) {
      return;
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      if (
        delivery.assignedUserId === user.id ||
        delivery.subscription?.assignedDeliveryUserId === user.id
      ) {
        return;
      }
      throw new ForbiddenException('Delivery not assigned to you');
    }
    if (
      user.role === UserRole.CUSTOMER &&
      delivery.customerUserId === user.id
    ) {
      return;
    }
    throw new ForbiddenException('Cannot access this delivery');
  }

  private async resolveEditReview(
    user: { id: string; role: UserRole },
    id: string,
    status:
      DeliveryEditReviewStatus.CONFIRMED | DeliveryEditReviewStatus.FLAGGED,
    eventType: DeliveryEventType,
    notificationType: NotificationType,
    title: string,
    dto: EditReviewDto,
  ) {
    if (
      user.role !== UserRole.FARM_OWNER &&
      user.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException(
        'Only farm owners can review delivery edits',
      );
    }
    const delivery = await this.getAccessibleDelivery(user, id);
    if (delivery.editReviewStatus !== DeliveryEditReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException('Delivery is not pending edit review');
    }
    if (delivery.lastEditedByUserId === user.id) {
      throw new ForbiddenException('You cannot review your own delivery edit');
    }

    delivery.editReviewStatus = status;
    delivery.version += 1;
    const saved = await this.deliveriesRepo.save(delivery);

    const latest = await this.editHistoryRepo.findOne({
      where: { deliveryId: id },
      order: { editedAt: 'DESC' },
    });

    await this.recordEvent({
      delivery: saved,
      eventType,
      actor: user,
      previousStatus: DeliveryEditReviewStatus.PENDING_REVIEW,
      newStatus: status,
      quantity: saved.finalDeliveredQuantity,
      notes: dto.notes ?? null,
    });

    const staffId = latest?.editedByUserId ?? saved.lastEditedByUserId;
    if (staffId && staffId !== user.id) {
      const customerName = delivery.customer?.name ?? 'customer';
      const prevRaw = latest?.previousQuantity;
      const nextRaw = latest?.newQuantity ?? saved.finalDeliveredQuantity;
      const prev = prevRaw != null ? formatQtyDisplay(prevRaw) : '?';
      const next = nextRaw != null ? formatQtyDisplay(nextRaw) : '?';
      await this.notifications.notify({
        type: notificationType,
        title,
        body:
          status === DeliveryEditReviewStatus.CONFIRMED
            ? `Your update for ${customerName}'s delivery ${prev} L → ${next} L was confirmed by the Farm Owner.`
            : `Your update for ${customerName}'s delivery ${prev} L → ${next} L was flagged for review by the Farm Owner.`,
        messageKey:
          status === DeliveryEditReviewStatus.CONFIRMED
            ? 'notifEditConfirmed'
            : 'notifEditFlagged',
        params: { name: customerName, prevQty: prev, newQty: next },
        recipientUserIds: [staffId],
        route: `/delivery/deliveries/${saved.id}`,
        farmId: saved.farmId,
        entityType: 'DELIVERY',
        entityId: saved.id,
        data: {
          notificationType,
          farmId: saved.farmId,
          customerId: saved.customerId,
          deliveryId: saved.id,
          deliveryStaffId: staffId,
          route: `/delivery/deliveries/${saved.id}`,
        },
        createdByUserId: user.id,
      });
    }

    return saved;
  }

  private async assertEditableByMembership(
    user: { id: string; role: UserRole },
    delivery: MilkDelivery,
  ) {
    if (user.role === UserRole.PLATFORM_OWNER) return;
    if (user.role === UserRole.FARM_OWNER && user.id === delivery.supplierId) {
      return;
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      if (!delivery.farmId) {
        throw new ForbiddenException('Delivery has no farm membership context');
      }
      const member = await this.membersRepo.findOne({
        where: {
          farmId: delivery.farmId,
          userId: user.id,
          memberRole: FarmMemberRole.DELIVERY_STAFF,
          status: FarmMemberStatus.ACTIVE,
        },
      });
      if (!member) {
        throw new ForbiddenException('Active farm membership required to edit');
      }
      return;
    }
    throw new ForbiddenException('Not allowed to edit this delivery');
  }

  private assertWithinEditWindow(delivery: MilkDelivery) {
    const minutes =
      this.config.get<number>('app.deliveryEditWindowMinutes') ?? 60;
    if (!delivery.deliveredAt) {
      throw new BadRequestException('Delivery has no delivered timestamp');
    }
    const elapsedMs = Date.now() - new Date(delivery.deliveredAt).getTime();
    if (elapsedMs > minutes * 60 * 1000) {
      throw new BadRequestException(
        `Edit window of ${minutes} minutes has expired. Request Farm Owner Correction.`,
      );
    }
  }

  private async assertNotOnFinalizedBill(deliveryId: string) {
    const count = await this.billItemsRepo
      .createQueryBuilder('i')
      .innerJoin('i.bill', 'b')
      .where('i.delivery_id = :deliveryId', { deliveryId })
      .andWhere('b.status NOT IN (:...open)', {
        open: [BillStatus.DRAFT, BillStatus.VOID],
      })
      .getCount();
    if (count > 0) {
      throw new BadRequestException(
        'This delivery belongs to a finalized bill. Create an adjustment workflow instead of editing the delivery.',
      );
    }
  }

  private async notifyOwnersOfEdit(
    delivery: MilkDelivery,
    editor: { id: string; role: UserRole },
    change: {
      previousQuantity: string;
      newQuantity: string;
      previousAmount: string;
      newAmount: string;
      previousStaffExtra: string;
      newStaffExtra: string;
      reasonText: string;
      editNote: string | null;
    },
  ) {
    const editorUser = await this.usersRepo.findOne({
      where: { id: editor.id },
    });
    const editorName = editorUser?.name ?? 'Delivery staff';
    const customerName = delivery.customer?.name ?? 'a customer';
    const route = `/farm/deliveries/${delivery.id}/edit-review`;
    const body = [
      `${editorName} edited ${customerName}'s delivery.`,
      `Previously: ${formatQtyDisplay(change.previousQuantity)} L`,
      `Now:        ${formatQtyDisplay(change.newQuantity)} L`,
      `Reason: ${change.reasonText}`,
      'Tap to review.',
    ].join('\n');

    const recipients = [delivery.supplierId].filter(
      (id) => id && id !== editor.id,
    );

    await this.notifications.notify({
      type: NotificationType.DELIVERY_EDITED,
      title: 'Delivery Edited',
      body,
      messageKey: 'notifDeliveryEdited',
      params: {
        editor: editorName,
        name: customerName,
        prevQty: formatQtyDisplay(change.previousQuantity),
        newQty: formatQtyDisplay(change.newQuantity),
        reason: change.reasonText,
      },
      recipientUserIds: recipients,
      route,
      farmId: delivery.farmId,
      entityType: 'DELIVERY',
      entityId: delivery.id,
      data: {
        notificationType: NotificationType.DELIVERY_EDITED,
        farmId: delivery.farmId,
        customerId: delivery.customerId,
        deliveryId: delivery.id,
        deliveryStaffId: editor.id,
        route,
      },
      createdByUserId: editor.id,
    });

    if (change.previousQuantity !== change.newQuantity) {
      await this.notifications.notify({
        type: NotificationType.DELIVERY_QUANTITY_CHANGED,
        title: 'Delivery Quantity Changed',
        body: `${customerName}: ${formatQtyDisplay(change.previousQuantity)} L → ${formatQtyDisplay(change.newQuantity)} L`,
        messageKey: 'notifQuantityChanged',
        params: {
          name: customerName,
          prevQty: formatQtyDisplay(change.previousQuantity),
          newQty: formatQtyDisplay(change.newQuantity),
        },
        recipientUserIds: recipients,
        route,
        farmId: delivery.farmId,
        entityType: 'DELIVERY',
        entityId: delivery.id,
        data: {
          notificationType: NotificationType.DELIVERY_QUANTITY_CHANGED,
          farmId: delivery.farmId,
          customerId: delivery.customerId,
          deliveryId: delivery.id,
          deliveryStaffId: editor.id,
          route,
        },
        createdByUserId: editor.id,
      });
    }

    if (change.previousStaffExtra !== change.newStaffExtra) {
      await this.notifications.notify({
        type: NotificationType.DELIVERY_EXTRA_CHANGED,
        title: 'Extra Quantity Changed',
        body: `${customerName} staff extra: ${formatQtyDisplay(change.previousStaffExtra)} L → ${formatQtyDisplay(change.newStaffExtra)} L`,
        messageKey: 'notifExtraChanged',
        params: {
          name: customerName,
          prevQty: formatQtyDisplay(change.previousStaffExtra),
          newQty: formatQtyDisplay(change.newStaffExtra),
        },
        recipientUserIds: recipients,
        route,
        farmId: delivery.farmId,
        entityType: 'DELIVERY',
        entityId: delivery.id,
        data: {
          notificationType: NotificationType.DELIVERY_EXTRA_CHANGED,
          farmId: delivery.farmId,
          customerId: delivery.customerId,
          deliveryId: delivery.id,
          deliveryStaffId: editor.id,
          route,
        },
        createdByUserId: editor.id,
      });
    }

    if (change.previousAmount !== change.newAmount) {
      await this.notifications.notify({
        type: NotificationType.DELIVERY_AMOUNT_CHANGED,
        title: 'Delivery Amount Changed',
        body: `${customerName}: ₹${change.previousAmount} → ₹${change.newAmount}`,
        messageKey: 'notifAmountChanged',
        params: {
          name: customerName,
          prevAmount: change.previousAmount,
          newAmount: change.newAmount,
        },
        recipientUserIds: recipients,
        route,
        farmId: delivery.farmId,
        entityType: 'DELIVERY',
        entityId: delivery.id,
        data: {
          notificationType: NotificationType.DELIVERY_AMOUNT_CHANGED,
          farmId: delivery.farmId,
          customerId: delivery.customerId,
          deliveryId: delivery.id,
          deliveryStaffId: editor.id,
          route,
        },
        createdByUserId: editor.id,
      });
    }
  }

  private async farmName(farmId: string | null) {
    if (farmId) {
      const farm = await this.farmsRepo.findOne({ where: { id: farmId } });
      if (farm) return farm.name;
    }
    return 'your dairy';
  }

  private async notifyFarmAndStaff(
    delivery: MilkDelivery,
    msg: {
      type: NotificationType;
      title: string;
      body: string;
      messageKey?: string;
      params?: Record<string, string | number | null | undefined>;
      route?: string;
    },
  ) {
    const recipients = [delivery.supplierId];
    if (
      delivery.assignedUserId &&
      delivery.assignedUserId !== delivery.supplierId
    ) {
      recipients.push(delivery.assignedUserId);
    }
    await this.notifications.notify({
      type: msg.type,
      title: msg.title,
      body: msg.body,
      messageKey: msg.messageKey,
      params: msg.params,
      recipientUserIds: recipients,
      route: msg.route ?? `/delivery/deliveries/${delivery.id}`,
      farmId: delivery.farmId,
      entityType: 'DELIVERY',
      entityId: delivery.id,
      data: { deliveryId: delivery.id, farmId: delivery.farmId },
    });
  }

  private async notifyCustomerFarmNoDelivery(
    delivery: MilkDelivery,
    notes: string,
  ) {
    if (!delivery.customerUserId) return;
    const isToday = delivery.deliveryDate === todayIso();
    await this.notifications.notify({
      type: NotificationType.FARM_NO_DELIVERY_TODAY,
      title: isToday ? 'No delivery today' : 'No delivery',
      body: isToday
        ? 'Your farm is not delivering milk today.'
        : `Your farm is not delivering milk on ${delivery.deliveryDate}.`,
      messageKey: isToday
        ? 'notifFarmNoDeliveryToday'
        : 'notifFarmNoDelivery',
      params: { date: delivery.deliveryDate },
      recipientUserIds: [delivery.customerUserId],
      route: '/customer/dashboard',
      farmId: delivery.farmId,
      entityType: 'DELIVERY',
      entityId: delivery.id,
      data: { deliveryId: delivery.id, farmId: delivery.farmId },
    });
  }
}

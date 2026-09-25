import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  FarmMemberStatus,
  NotificationType,
  PaymentStatus,
  PushDeliveryStatus,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import {
  normalizeLang,
  renderNotification,
} from '../../i18n/notification-i18n';
import { buildPageMeta } from '../../common/utils/pagination.util';
import {
  assertFound,
  assertSupplierOwnership,
} from '../../common/utils/ownership.util';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { Payment } from '../payments/entities/payment.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { User } from '../users/entities/user.entity';
import { DeviceToken } from './entities/device-token.entity';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { AppNotification } from './entities/notification.entity';
import { FcmPushProvider } from './fcm/fcm-push.provider';
import {
  ListNotificationsDto,
  RegisterDeviceTokenDto,
} from './dto/notification.dto';

export interface NotifyInput {
  type: NotificationType;
  /** English fallback stored on the notification row. */
  title: string;
  body: string;
  /** Catalog key (see src/i18n/notifications/*.json). */
  messageKey?: string;
  params?: Record<string, string | number | null | undefined>;
  recipientUserIds: string[];
  data?: Record<string, unknown>;
  route?: string | null;
  farmId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  createdByUserId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(AppNotification)
    private readonly notificationsRepo: Repository<AppNotification>,
    @InjectRepository(NotificationRecipient)
    private readonly recipientsRepo: Repository<NotificationRecipient>,
    @InjectRepository(DeviceToken)
    private readonly tokensRepo: Repository<DeviceToken>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    @InjectRepository(MilkSubscription)
    private readonly subscriptionsRepo: Repository<MilkSubscription>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly fcm: FcmPushProvider,
  ) {}

  async notify(input: NotifyInput) {
    const uniqueRecipients = [
      ...new Set(input.recipientUserIds.filter(Boolean)),
    ];
    if (!uniqueRecipients.length) {
      return { notification: null, recipients: [] as NotificationRecipient[] };
    }

    const enCopy = renderNotification('en', input.messageKey, input.params, {
      title: input.title,
      body: input.body,
    });

    const notification = await this.notificationsRepo.save(
      this.notificationsRepo.create({
        type: input.type,
        title: enCopy.title,
        body: enCopy.body,
        data: {
          type: input.type,
          route: input.route ?? null,
          ...(input.data ?? {}),
          // messageKey last so input.data cannot wipe catalog keys
          ...(input.messageKey
            ? { messageKey: input.messageKey, params: input.params ?? {} }
            : {}),
        },
        route: input.route ?? null,
        farmId: input.farmId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        createdByUserId: input.createdByUserId ?? null,
      }),
    );

    const savedRecipients = await this.recipientsRepo.save(
      uniqueRecipients.map((userId) =>
        this.recipientsRepo.create({
          notificationId: notification.id,
          userId,
          pushStatus: PushDeliveryStatus.PENDING,
        }),
      ),
    );
    const allTokens = await this.tokensRepo.find({
      where: { userId: In(uniqueRecipients) },
    });
    const tokensByUserId = new Map<string, DeviceToken[]>();
    for (const token of allTokens) {
      const existing = tokensByUserId.get(token.userId);
      if (existing) existing.push(token);
      else tokensByUserId.set(token.userId, [token]);
    }

    const users = await this.usersRepo.find({
      where: { id: In(uniqueRecipients) },
      select: ['id', 'preferredLanguage'],
    });
    const langByUser = new Map(
      users.map((u) => [u.id, normalizeLang(u.preferredLanguage)]),
    );

    const recipients: NotificationRecipient[] = [];
    for (const recipient of savedRecipients) {
      const tokens = tokensByUserId.get(recipient.userId) ?? [];
      if (!tokens.length) {
        recipient.pushStatus = PushDeliveryStatus.NO_DEVICE;
        recipient.pushError = 'No registered device tokens';
        await this.recipientsRepo.save(recipient);
        recipients.push(recipient);
        continue;
      }

      const localized = renderNotification(
        langByUser.get(recipient.userId) ?? 'en',
        input.messageKey,
        input.params,
        enCopy,
      );

      let anySent = false;
      let lastError: string | undefined;
      let skippedNotConfigured = false;
      for (const token of tokens) {
        const result = await this.fcm.send({
          token: token.token,
          title: localized.title,
          body: localized.body,
          data: Object.fromEntries(
            Object.entries({
              type: input.type,
              route: input.route ?? '',
              notificationId: notification.id,
              ...(input.data ?? {}),
              messageKey: input.messageKey ?? '',
            }).map(([k, v]) => [k, String(v ?? '')]),
          ),
        });
        if (result.status === 'SENT') anySent = true;
        if (result.status === 'SKIPPED_NOT_CONFIGURED')
          skippedNotConfigured = true;
        if (result.status === 'INVALID_TOKEN') {
          await this.tokensRepo.delete({ id: token.id });
        }
        if (result.error) lastError = result.error;
      }

      if (anySent) {
        recipient.pushStatus = PushDeliveryStatus.SENT;
      } else if (skippedNotConfigured) {
        recipient.pushStatus = PushDeliveryStatus.SKIPPED_NOT_CONFIGURED;
        recipient.pushError = lastError ?? 'FCM not configured';
      } else {
        recipient.pushStatus = PushDeliveryStatus.FAILED;
        recipient.pushError = lastError ?? 'Push failed';
      }
      await this.recipientsRepo.save(recipient);
      recipients.push(recipient);
    }

    return { notification, recipients };
  }

  async listForUser(userId: string, query: ListNotificationsDto) {
    const [rows, total] = await this.recipientsRepo.findAndCount({
      where: { userId, readAt: IsNull() },
      relations: ['notification'],
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const data = rows.map((r) => ({
      recipientId: r.id,
      readAt: r.readAt,
      pushStatus: r.pushStatus,
      notification: r.notification,
    }));
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async unreadCount(userId: string) {
    const count = await this.recipientsRepo.count({
      where: { userId, readAt: IsNull() },
    });
    return { count };
  }

  async markRead(userId: string, recipientId: string) {
    const row = assertFound(
      await this.recipientsRepo.findOne({
        where: { id: recipientId, userId },
      }),
      'Notification not found',
    );
    if (!row.readAt) {
      row.readAt = new Date();
      await this.recipientsRepo.save(row);
    }
    return row;
  }

  async markAllRead(userId: string) {
    await this.recipientsRepo
      .createQueryBuilder()
      .update(NotificationRecipient)
      .set({ readAt: () => 'NOW()' })
      .where('user_id = :userId', { userId })
      .andWhere('read_at IS NULL')
      .execute();
    return { success: true };
  }

  async getDetail(user: { id: string; role: UserRole }, recipientId: string) {
    const row = assertFound(
      await this.recipientsRepo.findOne({
        where: { id: recipientId, userId: user.id },
        relations: ['notification'],
      }),
      'Notification not found',
    );
    if (!row.readAt) {
      row.readAt = new Date();
      await this.recipientsRepo.save(row);
    }
    const context = await this.buildContext(user, row.notification);
    return {
      recipientId: row.id,
      readAt: row.readAt,
      notification: row.notification,
      context,
    };
  }

  private async buildContext(
    user: { id: string; role: UserRole },
    notification: AppNotification,
  ) {
    if (notification.entityType === 'PAYMENT' && notification.entityId) {
      return this.buildPaymentContext(user, notification.entityId);
    }
    if (
      (notification.entityType === 'DELIVERY' ||
        notification.entityType === 'MILK_DELIVERY') &&
      notification.entityId
    ) {
      return this.buildDeliveryContext(user, notification.entityId);
    }
    return null;
  }

  private async buildPaymentContext(
    user: { id: string; role: UserRole },
    paymentId: string,
  ) {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
      relations: ['customer'],
    });
    if (!payment) return null;
    if (!(await this.canViewPayment(user, payment))) return null;

    const staffCanAct =
      user.role === UserRole.DELIVERY_STAFF &&
      payment.status === PaymentStatus.PENDING_CONFIRMATION &&
      (await this.staffCanAccessPayment(user.id, payment));

    return {
      kind: 'PAYMENT' as const,
      paymentId: payment.id,
      amount: payment.amount,
      status: payment.status,
      paymentDate: payment.paymentDate,
      purpose: payment.purpose,
      paymentMethod: payment.paymentMethod,
      customerName: payment.customer?.name ?? null,
      notes: payment.notes,
      rejectionNote: payment.rejectionNote,
      proofImageUrl: payment.proofImageUrl,
      canConfirmCash: staffCanAct,
      canRejectCash: staffCanAct,
    };
  }

  private async buildDeliveryContext(
    user: { id: string; role: UserRole },
    deliveryId: string,
  ) {
    const delivery = await this.deliveriesRepo.findOne({
      where: { id: deliveryId },
      relations: ['customer', 'subscription'],
    });
    if (!delivery) return null;
    if (!this.canViewDelivery(user, delivery)) return null;

    return {
      kind: 'DELIVERY' as const,
      deliveryId: delivery.id,
      deliveryDate: delivery.deliveryDate,
      deliveryShift: delivery.deliveryShift,
      status: delivery.status,
      confirmationStatus: delivery.confirmationStatus,
      quantity: delivery.finalDeliveredQuantity ?? delivery.quantity,
      amount: delivery.amount,
      customerName: delivery.customer?.name ?? null,
    };
  }

  private async canViewPayment(
    user: { id: string; role: UserRole },
    payment: Payment,
  ): Promise<boolean> {
    if (user.role === UserRole.PLATFORM_OWNER) return true;
    if (user.role === UserRole.FARM_OWNER) {
      try {
        assertSupplierOwnership(user, payment.supplierId, 'payment');
        return true;
      } catch {
        return false;
      }
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      return this.staffCanAccessPayment(user.id, payment);
    }
    if (user.role === UserRole.CUSTOMER) {
      const customer =
        payment.customer ??
        (await this.customersRepo.findOne({
          where: { id: payment.customerId },
        }));
      return customer?.customerUserId === user.id;
    }
    return false;
  }

  private async staffCanAccessPayment(
    userId: string,
    payment: Payment,
  ): Promise<boolean> {
    if (payment.farmId) {
      const member = await this.membersRepo.findOne({
        where: {
          farmId: payment.farmId,
          userId,
          status: FarmMemberStatus.ACTIVE,
        },
      });
      if (member) return true;
    }
    const assigned = await this.subscriptionsRepo.findOne({
      where: {
        customerId: payment.customerId,
        assignedDeliveryUserId: userId,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    return !!assigned;
  }

  private canViewDelivery(
    user: { id: string; role: UserRole },
    delivery: MilkDelivery & {
      customer?: Customer | null;
      subscription?: MilkSubscription | null;
    },
  ): boolean {
    if (user.role === UserRole.PLATFORM_OWNER) return true;
    if (user.role === UserRole.FARM_OWNER) {
      try {
        assertSupplierOwnership(user, delivery.supplierId, 'delivery');
        return true;
      } catch {
        return false;
      }
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      const assigned =
        delivery.assignedUserId === user.id ||
        delivery.subscription?.assignedDeliveryUserId === user.id;
      return assigned;
    }
    if (user.role === UserRole.CUSTOMER) {
      return delivery.customer?.customerUserId === user.id;
    }
    return false;
  }

  async registerDevice(userId: string, dto: RegisterDeviceTokenDto) {
    const existing = await this.tokensRepo.findOne({
      where: { token: dto.token },
    });
    if (existing) {
      existing.userId = userId;
      existing.platform = dto.platform;
      existing.deviceId = dto.deviceId ?? existing.deviceId;
      existing.lastSeenAt = new Date();
      return this.tokensRepo.save(existing);
    }
    return this.tokensRepo.save(
      this.tokensRepo.create({
        userId,
        token: dto.token,
        platform: dto.platform,
        deviceId: dto.deviceId ?? null,
        lastSeenAt: new Date(),
      }),
    );
  }

  async unregisterDevice(userId: string, token: string) {
    await this.tokensRepo.delete({ userId, token });
    return { success: true };
  }
}

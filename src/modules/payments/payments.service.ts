import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, Repository } from 'typeorm';
import {
  CashPaymentPurpose,
  FarmMemberStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import { todayIso } from '../../common/utils/date.util';
import { roundMoney } from '../../common/utils/decimal.util';
import { buildPageMeta } from '../../common/utils/pagination.util';
import {
  assertFound,
  assertSupplierOwnership,
  getSupplierIdOrThrow,
} from '../../common/utils/ownership.util';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { CustomersService } from '../customers/customers.service';
import { Customer } from '../customers/entities/customer.entity';
import { FarmDeliverySettings } from '../farms/entities/farm-delivery-settings.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import { ChangeLog } from '../sync/entities/change-log.entity';
import {
  ClaimCashPaymentDto,
  CreatePaymentDto,
  ListPaymentsDto,
  RecordCashPaymentDto,
  RejectCashPaymentDto,
  UpdatePaymentDto,
} from './dto/payment.dto';
import { Payment } from './entities/payment.entity';
import { saveCashProofImage } from './utils/cash-proof-upload.util';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(ChangeLog)
    private readonly changeLogRepo: Repository<ChangeLog>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(FarmDeliverySettings)
    private readonly settingsRepo: Repository<FarmDeliverySettings>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    @InjectRepository(MilkSubscription)
    private readonly subscriptionsRepo: Repository<MilkSubscription>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    private readonly customersService: CustomersService,
    private readonly billingService: BillingService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async recordCash(
    user: { id: string; role: UserRole },
    dto: RecordCashPaymentDto,
  ) {
    if (user.role === UserRole.DELIVERY_STAFF) {
      if (!dto.farmId) {
        throw new BadRequestException('farmId is required for staff cash');
      }
      const settings = await this.settingsRepo.findOne({
        where: { farmId: dto.farmId },
      });
      if (!settings?.canRecordCashPayment) {
        throw new ForbiddenException(
          'Cash collection not permitted for delivery staff',
        );
      }
    }

    const customer = assertFound(
      await this.customersRepo.findOne({
        where: { id: dto.customerId },
      }),
      'Customer not found',
    );

    if (user.role === UserRole.FARM_OWNER && customer.supplierId !== user.id) {
      throw new ForbiddenException();
    }

    if (new Decimal(dto.amount).lte(0)) {
      throw new BadRequestException('Payment amount must be > 0');
    }

    const existing = await this.paymentsRepo.findOne({
      where: { clientReferenceId: dto.clientReferenceId },
    });
    if (existing) return existing;

    const payment = await this.paymentsRepo.save(
      this.paymentsRepo.create({
        supplierId: customer.supplierId,
        farmId: dto.farmId ?? null,
        customerId: customer.id,
        billId: dto.billId ?? null,
        amount: roundMoney(dto.amount),
        paymentMethod: PaymentMethod.CASH,
        purpose: dto.purpose,
        status: PaymentStatus.CONFIRMED,
        paymentDate: dto.paymentDate,
        notes: dto.notes ?? null,
        clientReferenceId: dto.clientReferenceId,
        version: 1,
        recordedByUserId: user.id,
        confirmedByUserId: user.id,
        confirmedAt: new Date(),
      }),
    );

    if (dto.billId) {
      await this.recalcBill(dto.billId, this.dataSource.manager);
    }

    const recipients = [customer.supplierId];
    if (customer.customerUserId) recipients.push(customer.customerUserId);
    await this.notifications.notify({
      type: NotificationType.CASH_PAYMENT_RECORDED,
      title: 'Cash payment recorded',
      body: `₹${payment.amount} cash received (${dto.purpose}).`,
      messageKey: 'notifCashRecorded',
      params: { amount: payment.amount, purpose: dto.purpose },
      recipientUserIds: recipients,
      route: '/customer/billing',
      farmId: dto.farmId ?? null,
      entityType: 'PAYMENT',
      entityId: payment.id,
      createdByUserId: user.id,
    });

    return payment;
  }

  async claimCash(
    user: { id: string; role: UserRole },
    dto: ClaimCashPaymentDto,
    proof: Express.Multer.File,
  ) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customers can claim cash payments');
    }
    if (new Decimal(dto.amount).lte(0)) {
      throw new BadRequestException('Payment amount must be > 0');
    }

    const customers = await this.customersRepo.find({
      where: { customerUserId: user.id },
    });
    if (!customers.length) {
      throw new BadRequestException(
        'No customer profile linked to this account',
      );
    }

    let customer = customers[0];
    if (dto.customerId) {
      customer = assertFound(
        customers.find((c) => c.id === dto.customerId) ?? null,
        'Customer profile not found for this account',
      );
    }

    const subs = await this.subscriptionsRepo.find({
      where: {
        customerId: customer.id,
        status: SubscriptionStatus.ACTIVE,
      },
      order: { updatedAt: 'DESC' },
    });
    const farmId = dto.farmId ?? subs.find((s) => s.farmId)?.farmId ?? null;

    const existing = await this.paymentsRepo.findOne({
      where: { clientReferenceId: dto.clientReferenceId },
    });
    if (existing) return existing;

    const proofImageUrl = await saveCashProofImage(proof);
    const paymentDate = dto.paymentDate ?? todayIso();

    const payment = await this.paymentsRepo.save(
      this.paymentsRepo.create({
        supplierId: customer.supplierId,
        farmId,
        customerId: customer.id,
        billId: null,
        amount: roundMoney(dto.amount),
        paymentMethod: PaymentMethod.CASH,
        purpose: CashPaymentPurpose.BILL_PAYMENT,
        status: PaymentStatus.PENDING_CONFIRMATION,
        paymentDate,
        notes: dto.notes ?? null,
        proofImageUrl,
        clientReferenceId: dto.clientReferenceId,
        version: 1,
        recordedByUserId: user.id,
      }),
    );

    const staffIds = new Set<string>();
    for (const sub of subs) {
      if (sub.assignedDeliveryUserId) staffIds.add(sub.assignedDeliveryUserId);
    }
    if (farmId) {
      const members = await this.membersRepo.find({
        where: {
          farmId,
          status: FarmMemberStatus.ACTIVE,
        },
      });
      for (const m of members) {
        if (m.userId) staffIds.add(m.userId);
      }
    }

    const recipients = [...staffIds, customer.supplierId].filter(
      (id) => id && id !== user.id,
    );
    await this.notifications.notify({
      type: NotificationType.CASH_PAYMENT_CLAIMED,
      title: 'Cash payment to confirm',
      body: `${customer.name} reported ₹${payment.amount} cash. Review the photo and confirm.`,
      messageKey: 'notifCashToConfirm',
      params: { name: customer.name, amount: payment.amount },
      recipientUserIds: recipients,
      route: '/delivery/pending-cash',
      farmId,
      entityType: 'PAYMENT',
      entityId: payment.id,
      createdByUserId: user.id,
    });

    return payment;
  }

  async confirmCash(user: { id: string; role: UserRole }, id: string) {
    const payment = await this.getAccessiblePendingOrThrow(user, id);
    if (payment.status !== PaymentStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('Payment is not pending confirmation');
    }

    payment.status = PaymentStatus.CONFIRMED;
    payment.confirmedByUserId = user.id;
    payment.confirmedAt = new Date();
    payment.rejectionNote = null;
    payment.version += 1;
    const saved = await this.paymentsRepo.save(payment);

    if (saved.billId) {
      await this.recalcBill(saved.billId, this.dataSource.manager);
    }

    const customer = await this.customersRepo.findOne({
      where: { id: saved.customerId },
    });
    if (customer?.customerUserId) {
      await this.notifications.notify({
        type: NotificationType.CASH_PAYMENT_CONFIRMED,
        title: 'Cash payment confirmed',
        body: `₹${saved.amount} cash was confirmed by delivery staff.`,
        messageKey: 'notifCashConfirmed',
        params: { amount: saved.amount },
        recipientUserIds: [customer.customerUserId],
        route: '/customer/billing',
        farmId: saved.farmId,
        entityType: 'PAYMENT',
        entityId: saved.id,
        createdByUserId: user.id,
      });
    }
    return saved;
  }

  async rejectCash(
    user: { id: string; role: UserRole },
    id: string,
    dto: RejectCashPaymentDto,
  ) {
    const payment = await this.getAccessiblePendingOrThrow(user, id);
    if (payment.status !== PaymentStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('Payment is not pending confirmation');
    }

    payment.status = PaymentStatus.REJECTED;
    payment.confirmedByUserId = user.id;
    payment.confirmedAt = new Date();
    payment.rejectionNote = dto.notes?.trim() || null;
    payment.version += 1;
    const saved = await this.paymentsRepo.save(payment);

    const customer = await this.customersRepo.findOne({
      where: { id: saved.customerId },
    });
    if (customer?.customerUserId) {
      await this.notifications.notify({
        type: NotificationType.CASH_PAYMENT_REJECTED,
        title: 'Cash payment rejected',
        body: `₹${saved.amount} cash claim was rejected.${
          saved.rejectionNote ? ` ${saved.rejectionNote}` : ''
        }`,
        messageKey: 'notifCashRejected',
        params: {
          amount: saved.amount,
          notes: saved.rejectionNote ? ` ${saved.rejectionNote}` : '',
        },
        recipientUserIds: [customer.customerUserId],
        route: '/customer/billing',
        farmId: saved.farmId,
        entityType: 'PAYMENT',
        entityId: saved.id,
        createdByUserId: user.id,
      });
    }
    return saved;
  }

  async listPendingCash(user: { id: string; role: UserRole }) {
    if (user.role === UserRole.DELIVERY_STAFF) {
      const memberships = await this.membersRepo.find({
        where: { userId: user.id, status: FarmMemberStatus.ACTIVE },
      });
      const farmIds = memberships.map((m) => m.farmId);
      const assignedCustomerIds = (
        await this.subscriptionsRepo.find({
          where: {
            assignedDeliveryUserId: user.id,
            status: SubscriptionStatus.ACTIVE,
          },
          select: ['customerId'],
        })
      ).map((s) => s.customerId);

      const qb = this.paymentsRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.customer', 'c')
        .where('p.status = :status', {
          status: PaymentStatus.PENDING_CONFIRMATION,
        })
        .orderBy('p.created_at', 'DESC');

      if (farmIds.length && assignedCustomerIds.length) {
        qb.andWhere(
          '(p.farm_id IN (:...farmIds) OR p.customer_id IN (:...customerIds))',
          { farmIds, customerIds: assignedCustomerIds },
        );
      } else if (farmIds.length) {
        qb.andWhere('p.farm_id IN (:...farmIds)', { farmIds });
      } else if (assignedCustomerIds.length) {
        qb.andWhere('p.customer_id IN (:...customerIds)', {
          customerIds: assignedCustomerIds,
        });
      } else {
        return [];
      }
      return qb.getMany();
    }

    if (user.role === UserRole.FARM_OWNER) {
      return this.paymentsRepo.find({
        where: {
          supplierId: user.id,
          status: PaymentStatus.PENDING_CONFIRMATION,
        },
        relations: ['customer'],
        order: { createdAt: 'DESC' },
      });
    }

    if (user.role === UserRole.PLATFORM_OWNER) {
      return this.paymentsRepo.find({
        where: { status: PaymentStatus.PENDING_CONFIRMATION },
        relations: ['customer'],
        order: { createdAt: 'DESC' },
      });
    }

    throw new ForbiddenException();
  }

  async create(user: { id: string; role: UserRole }, dto: CreatePaymentDto) {
    const existing = await this.paymentsRepo.findOne({
      where: { clientReferenceId: dto.clientReferenceId },
    });
    if (existing) return existing;

    const customer = await this.customersService.findOne(user, dto.customerId);
    if (new Decimal(dto.amount).lte(0)) {
      throw new BadRequestException('Payment amount must be > 0');
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.billId) {
        const bill = assertFound(
          await manager.findOne(MonthlyBill, { where: { id: dto.billId } }),
          'Bill not found',
        );
        assertSupplierOwnership(user, bill.supplierId, 'bill');
        if (bill.customerId !== customer.id) {
          throw new BadRequestException('Bill does not belong to customer');
        }
      }

      const payment = await manager.save(
        manager.create(Payment, {
          supplierId: customer.supplierId,
          customerId: customer.id,
          billId: dto.billId ?? null,
          amount: roundMoney(dto.amount),
          paymentMethod: dto.paymentMethod,
          status: PaymentStatus.CONFIRMED,
          paymentDate: dto.paymentDate,
          referenceNumber: dto.referenceNumber ?? null,
          notes: dto.notes ?? null,
          clientReferenceId: dto.clientReferenceId,
          version: 1,
          recordedByUserId: user.id,
          confirmedByUserId: user.id,
          confirmedAt: new Date(),
        }),
      );

      if (dto.billId) {
        await this.recalcBill(dto.billId, manager);
      }

      await manager.save(
        manager.create(ChangeLog, {
          supplierId: customer.supplierId,
          entityType: 'PAYMENT',
          entityId: payment.id,
          changeType: 'CREATE',
          entityVersion: payment.version,
        }),
      );

      await this.auditService.log({
        actorUserId: user.id,
        supplierId: customer.supplierId,
        entityType: 'PAYMENT',
        entityId: payment.id,
        action: 'PAYMENT_CREATED',
        newValues: { amount: payment.amount, billId: payment.billId },
      });

      return payment;
    });
  }

  async findAll(user: { id: string; role: UserRole }, query: ListPaymentsDto) {
    const supplierId =
      user.role === UserRole.PLATFORM_OWNER
        ? undefined
        : getSupplierIdOrThrow(user);
    const qb = this.paymentsRepo.createQueryBuilder('p');
    if (supplierId) qb.andWhere('p.supplier_id = :supplierId', { supplierId });
    if (query.customerId)
      qb.andWhere('p.customer_id = :customerId', {
        customerId: query.customerId,
      });
    if (query.billId)
      qb.andWhere('p.bill_id = :billId', { billId: query.billId });
    if (query.paymentMethod)
      qb.andWhere('p.payment_method = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    if (query.status)
      qb.andWhere('p.status = :status', { status: query.status });
    if (query.dateFrom)
      qb.andWhere('p.payment_date >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere('p.payment_date <= :dateTo', { dateTo: query.dateTo });
    qb.orderBy('p.payment_date', query.sortOrder || 'DESC');
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async findOne(user: { id: string; role: UserRole }, id: string) {
    const payment = assertFound(
      await this.paymentsRepo.findOne({ where: { id } }),
      'Payment not found',
    );
    if (user.role === UserRole.DELIVERY_STAFF) {
      await this.assertStaffCanAccessPayment(user, payment);
      return payment;
    }
    assertSupplierOwnership(user, payment.supplierId, 'payment');
    return payment;
  }

  async update(
    user: { id: string; role: UserRole },
    id: string,
    dto: UpdatePaymentDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const payment = assertFound(
        await manager.findOne(Payment, { where: { id } }),
        'Payment not found',
      );
      assertSupplierOwnership(user, payment.supplierId, 'payment');
      const oldBillId = payment.billId;

      if (dto.amount !== undefined) payment.amount = roundMoney(dto.amount);
      if (dto.paymentMethod !== undefined)
        payment.paymentMethod = dto.paymentMethod;
      if (dto.paymentDate !== undefined) payment.paymentDate = dto.paymentDate;
      if (dto.referenceNumber !== undefined)
        payment.referenceNumber = dto.referenceNumber ?? null;
      if (dto.notes !== undefined) payment.notes = dto.notes ?? null;
      if (dto.billId !== undefined) payment.billId = dto.billId;
      payment.version += 1;

      const saved = await manager.save(payment);

      if (oldBillId) await this.recalcBill(oldBillId, manager);
      if (saved.billId && saved.billId !== oldBillId) {
        await this.recalcBill(saved.billId, manager);
      }

      await manager.save(
        manager.create(ChangeLog, {
          supplierId: saved.supplierId,
          entityType: 'PAYMENT',
          entityId: saved.id,
          changeType: 'UPDATE',
          entityVersion: saved.version,
        }),
      );
      return saved;
    });
  }

  async remove(user: { id: string; role: UserRole }, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const payment = assertFound(
        await manager.findOne(Payment, { where: { id } }),
        'Payment not found',
      );
      assertSupplierOwnership(user, payment.supplierId, 'payment');
      const billId = payment.billId;
      payment.version += 1;
      await manager.save(payment);
      await manager.softRemove(payment);
      if (billId) await this.recalcBill(billId, manager);
      await manager.save(
        manager.create(ChangeLog, {
          supplierId: payment.supplierId,
          entityType: 'PAYMENT',
          entityId: payment.id,
          changeType: 'DELETE',
          entityVersion: payment.version,
        }),
      );
      return { success: true };
    });
  }

  private async getAccessiblePendingOrThrow(
    user: { id: string; role: UserRole },
    id: string,
  ) {
    const payment = assertFound(
      await this.paymentsRepo.findOne({ where: { id } }),
      'Payment not found',
    );
    if (user.role === UserRole.PLATFORM_OWNER) return payment;
    if (user.role === UserRole.FARM_OWNER) {
      assertSupplierOwnership(user, payment.supplierId, 'payment');
      return payment;
    }
    if (user.role === UserRole.DELIVERY_STAFF) {
      await this.assertStaffCanAccessPayment(user, payment);
      return payment;
    }
    throw new ForbiddenException();
  }

  private async assertStaffCanAccessPayment(
    user: { id: string },
    payment: Payment,
  ) {
    if (payment.farmId) {
      const member = await this.membersRepo.findOne({
        where: {
          farmId: payment.farmId,
          userId: user.id,
          status: FarmMemberStatus.ACTIVE,
        },
      });
      if (member) return;
    }
    const assigned = await this.subscriptionsRepo.findOne({
      where: {
        customerId: payment.customerId,
        assignedDeliveryUserId: user.id,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    if (!assigned) {
      throw new ForbiddenException('Not assigned to this customer/farm');
    }
  }

  private async recalcBill(billId: string, manager: DataSource['manager']) {
    const payments = await manager.find(Payment, {
      where: { billId, status: PaymentStatus.CONFIRMED },
    });
    const paid = payments.reduce(
      (acc, p) => acc.plus(new Decimal(p.amount)),
      new Decimal(0),
    );
    await this.billingService.recalculateBillPaidAmount(
      billId,
      paid.toFixed(2),
      manager,
    );
  }
}

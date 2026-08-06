import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../common/enums';
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
import { ChangeLog } from '../sync/entities/change-log.entity';
import {
  CreatePaymentDto,
  ListPaymentsDto,
  UpdatePaymentDto,
} from './dto/payment.dto';
import { Payment } from './entities/payment.entity';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(ChangeLog)
    private readonly changeLogRepo: Repository<ChangeLog>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly customersService: CustomersService,
    private readonly billingService: BillingService,
    private readonly auditService: AuditService,
  ) {}

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
          paymentDate: dto.paymentDate,
          referenceNumber: dto.referenceNumber ?? null,
          notes: dto.notes ?? null,
          clientReferenceId: dto.clientReferenceId,
          version: 1,
          recordedByUserId: user.id,
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

  private async recalcBill(billId: string, manager: DataSource['manager']) {
    const payments = await manager.find(Payment, {
      where: { billId },
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

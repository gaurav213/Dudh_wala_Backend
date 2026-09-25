import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { In, Repository } from 'typeorm';
import { BillStatus, DeliveryStatus, PaymentStatus } from '../../common/enums';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { todayIso } from '../../common/utils/date.util';
import { roundMoney, roundQty, splitLedgerBalance } from '../../common/utils/decimal.util';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { FarmMilkProduct } from '../farms/entities/farm-milk-product.entity';
import { Payment } from '../payments/entities/payment.entity';
import {
  milkTypeLabel,
  resolveProductName,
} from '../../common/utils/delivery-display.util';
import { MeDeliveriesQueryDto } from './dto/me-deliveries-query.dto';

@Injectable()
export class MeService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(MonthlyBill)
    private readonly billsRepo: Repository<MonthlyBill>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
  ) {}

  private async customerIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.customersRepo.find({
      where: { customerUserId: userId },
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }

  async billingSummary(userId: string) {
    const customerIds = await this.customerIdsForUser(userId);
    if (!customerIds.length) {
      return {
        todaysAmount: '0.00',
        monthDeliveredDays: 0,
        monthRegularQuantity: '0.000',
        monthExtraQuantity: '0.000',
        monthTotalQuantity: '0.000',
        monthMilkCharges: '0.00',
        previousBalance: '0.00',
        paymentsThisMonth: '0.00',
        pendingCashThisMonth: '0.00',
        pendingCashClaims: 0,
        outstandingBalance: '0.00',
        billTillToday: '0.00',
        advanceBalance: '0.00',
      };
    }

    const today = todayIso();
    const monthStart = `${today.slice(0, 7)}-01`;

    const monthDeliveries = await this.deliveriesRepo
      .createQueryBuilder('d')
      .where('d.customer_id IN (:...customerIds)', { customerIds })
      .andWhere('d.delivery_date >= :monthStart', { monthStart })
      .andWhere('d.delivery_date <= :today', { today })
      .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .getMany();

    const billable = monthDeliveries.filter(
      (d) =>
        d.status !== DeliveryStatus.DISPUTED &&
        d.confirmationStatus !== 'CUSTOMER_REPORTED_NOT_RECEIVED' &&
        d.confirmationStatus !== 'DISPUTED',
    );

    const todayDelivery = billable.find((d) => d.deliveryDate === today);
    const todaysAmount = todayDelivery?.amount ?? '0.00';

    const regular = billable.reduce(
      (acc, d) => acc.plus(d.scheduledQuantity || 0),
      new Decimal(0),
    );
    const extra = billable.reduce(
      (acc, d) =>
        acc.plus(d.customerExtraQuantity || 0).plus(d.staffExtraQuantity || 0),
      new Decimal(0),
    );
    const totalQty = billable.reduce(
      (acc, d) => acc.plus(d.finalDeliveredQuantity || d.quantity || 0),
      new Decimal(0),
    );
    const milkCharges = billable.reduce(
      (acc, d) => acc.plus(d.amount || 0),
      new Decimal(0),
    );

    const payments = await this.paymentsRepo
      .createQueryBuilder('p')
      .where('p.customer_id IN (:...customerIds)', { customerIds })
      .andWhere('p.payment_date >= :monthStart', { monthStart })
      .andWhere('p.payment_date <= :today', { today })
      .getMany();
    const confirmed = payments.filter(
      (p) => p.status === PaymentStatus.CONFIRMED,
    );
    const pending = payments.filter(
      (p) => p.status === PaymentStatus.PENDING_CONFIRMATION,
    );
    const paymentsTotal = confirmed.reduce(
      (acc, p) => acc.plus(p.amount || 0),
      new Decimal(0),
    );
    const pendingTotal = pending.reduce(
      (acc, p) => acc.plus(p.amount || 0),
      new Decimal(0),
    );

    const previousBalance = await this.priorUnpaidRemaining(
      customerIds,
      `${today.slice(0, 7)}-01`,
    );
    const net = previousBalance.plus(milkCharges).minus(paymentsTotal);
    const ledger = splitLedgerBalance(net);

    return {
      todaysAmount: roundMoney(todaysAmount),
      monthDeliveredDays: new Set(billable.map((d) => d.deliveryDate)).size,
      monthRegularQuantity: roundQty(regular.toString()),
      monthExtraQuantity: roundQty(extra.toString()),
      monthTotalQuantity: roundQty(totalQty.toString()),
      monthMilkCharges: roundMoney(milkCharges.toString()),
      previousBalance: roundMoney(previousBalance.toString()),
      paymentsThisMonth: roundMoney(paymentsTotal.toString()),
      pendingCashThisMonth: roundMoney(pendingTotal.toString()),
      pendingCashClaims: pending.length,
      outstandingBalance: ledger.outstandingBalance,
      billTillToday: ledger.billTillToday,
      advanceBalance: ledger.advanceBalance,
    };
  }

  /** Unpaid remaining from prior months (same rule as bill generate carryover). */
  private async priorUnpaidRemaining(
    customerIds: string[],
    /** First day of current month as YYYY-MM-01 (billing_month is a date column). */
    currentMonthStart: string,
  ): Promise<Decimal> {
    let total = new Decimal(0);
    for (const customerId of customerIds) {
      const currentBill = await this.billsRepo.findOne({
        where: { customerId, billingMonth: currentMonthStart },
      });
      if (currentBill) {
        total = total.plus(currentBill.previousBalance || 0);
        continue;
      }
      const previous = await this.billsRepo
        .createQueryBuilder('b')
        .where('b.customer_id = :customerId', { customerId })
        .andWhere('b.billing_month < :currentMonthStart', {
          currentMonthStart,
        })
        .andWhere('b.status != :void', { void: BillStatus.VOID })
        .orderBy('b.billing_month', 'DESC')
        .getOne();
      if (previous) total = total.plus(previous.remainingBalance || 0);
    }
    return total;
  }

  async listBills(userId: string, query: PaginationDto) {
    const customerIds = await this.customerIdsForUser(userId);
    if (customerIds.length === 0) {
      return { data: [], meta: buildPageMeta(query.page, query.limit, 0) };
    }
    const [data, total] = await this.billsRepo.findAndCount({
      where: { customerId: In(customerIds) },
      order: { billingMonth: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    const summary = await this.billingSummary(userId);
    const today = todayIso();
    const currentMonth = `${today.slice(0, 7)}-01`;
    const hasCurrent = data.some((b) => {
      const raw = String(b.billingMonth ?? '');
      const normalized =
        raw.length === 7 ? `${raw}-01` : raw.slice(0, 10);
      return normalized === currentMonth;
    });

    const rows: Array<Record<string, unknown>> = data.map((b) => ({
      ...b,
      tillDate: false,
    }));

    // Always expose this month as a payable bill (delivered milk till today).
    if (!hasCurrent && (query.page ?? 1) === 1) {
      rows.unshift({
        id: `till-date-${currentMonth}`,
        customerId: customerIds[0],
        billingMonth: currentMonth,
        totalDeliveryDays: summary.monthDeliveredDays,
        totalQuantity: summary.monthTotalQuantity,
        milkAmount: summary.monthMilkCharges,
        previousBalance: summary.previousBalance,
        discount: '0.00',
        adjustment: '0.00',
        totalAmount: summary.monthMilkCharges,
        paidAmount: summary.paymentsThisMonth,
        remainingBalance: summary.billTillToday,
        status: BillStatus.ISSUED,
        generatedAt: new Date().toISOString(),
        tillDate: true,
        periodEnd: today,
      });
    } else if (hasCurrent) {
      // Keep the stored bill, but stamp tillDate so UI can say "till today".
      const idx = rows.findIndex((b) => {
        const raw = String(b['billingMonth'] ?? '');
        const normalized =
          raw.length === 7 ? `${raw}-01` : raw.slice(0, 10);
        return normalized === currentMonth;
      });
      if (idx >= 0) {
        rows[idx] = {
          ...rows[idx],
          tillDate: true,
          periodEnd: today,
          // Live ledger wins for what the customer owes today.
          paidAmount: summary.paymentsThisMonth,
          remainingBalance: summary.billTillToday,
          totalAmount: summary.monthMilkCharges,
          milkAmount: summary.monthMilkCharges,
          totalQuantity: summary.monthTotalQuantity,
          totalDeliveryDays: summary.monthDeliveredDays,
        };
      }
    }

    return {
      data: rows,
      meta: buildPageMeta(query.page, query.limit, total + (hasCurrent ? 0 : 1)),
    };
  }

  async listPayments(userId: string, query: PaginationDto) {
    const customerIds = await this.customerIdsForUser(userId);
    if (customerIds.length === 0) {
      return { data: [], meta: buildPageMeta(query.page, query.limit, 0) };
    }
    const [data, total] = await this.paymentsRepo.findAndCount({
      where: { customerId: In(customerIds) },
      order: { paymentDate: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async listDeliveries(userId: string, query: MeDeliveriesQueryDto) {
    const customerIds = await this.customerIdsForUser(userId);
    if (customerIds.length === 0) {
      return { data: [], meta: buildPageMeta(query.page, query.limit, 0) };
    }
    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.subscription', 'sub')
      .where('d.customer_id IN (:...customerIds)', { customerIds })
      .andWhere('d.status != :cancelled', {
        cancelled: DeliveryStatus.CANCELLED,
      });
    if (query.dateFrom) {
      qb.andWhere('d.deliveryDate >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('d.deliveryDate <= :dateTo', { dateTo: query.dateTo });
    }
    qb.orderBy('d.deliveryDate', query.sortOrder ?? 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await qb.getManyAndCount();

    const productIds = [
      ...new Set(
        rows
          .map((d) => d.farmProductId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const products = productIds.length
      ? await this.productsRepo.find({ where: { id: In(productIds) } })
      : [];
    const productNameById = new Map(products.map((p) => [p.id, p.name]));

    const data = rows.map((d) => {
      const milkType = d.subscription?.milkType ?? null;
      const productName = resolveProductName({
        productName: d.farmProductId
          ? productNameById.get(d.farmProductId)
          : null,
        milkType,
      });
      // Drop nested subscription — clients only need flat product fields.
      const { subscription: _ignored, ...rest } = d as MilkDelivery & {
        subscription?: unknown;
      };
      return {
        ...rest,
        milkType,
        milkTypeLabel: milkTypeLabel(milkType),
        productName,
      };
    });

    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }
}

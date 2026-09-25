import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillStatus, DeliveryStatus, UserRole } from '../../common/enums';
import { todayIso } from '../../common/utils/date.util';
import { getSupplierIdOrThrow } from '../../common/utils/ownership.util';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { aggregateFarmTodayMetrics } from '../deliveries/utils/farm-today-metrics.util';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(MonthlyBill)
    private readonly billsRepo: Repository<MonthlyBill>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async farmToday(
    user: { id: string; role: UserRole },
    farmId?: string,
    opts?: { date?: string; from?: string; to?: string },
  ) {
    const supplierId = getSupplierIdOrThrow(user);
    const today = todayIso();
    let fromDate =
      opts?.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)
        ? opts.from
        : opts?.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)
          ? opts.date
          : today;
    let toDate =
      opts?.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : fromDate;
    if (fromDate > toDate) {
      const swap = fromDate;
      fromDate = toDate;
      toDate = swap;
    }

    const qb = this.deliveriesRepo
      .createQueryBuilder('d')
      .where('d.supplier_id = :supplierId', { supplierId })
      .andWhere('d.delivery_date >= :fromDate', { fromDate })
      .andWhere('d.delivery_date <= :toDate', { toDate });
    if (farmId) {
      qb.andWhere('d.farm_id = :farmId', { farmId });
    }
    const rows = await qb.getMany();
    const metrics = aggregateFarmTodayMetrics(rows);
    const payments = await this.paymentsRepo
      .createQueryBuilder('p')
      .where('p.supplier_id = :supplierId', { supplierId })
      .andWhere('p.payment_date >= :fromDate', { fromDate })
      .andWhere('p.payment_date <= :toDate', { toDate })
      .getMany();
    const collectionsToday = payments
      .reduce((a, p) => a + Number(p.amount), 0)
      .toFixed(2);

    return {
      date: fromDate,
      fromDate,
      toDate,
      ...metrics,
      collectionsToday,
      extraBreakdown: {
        customerRequested: metrics.customerExtraQuantity,
        staffAdded: metrics.staffExtraQuantity,
        total: metrics.totalExtraQuantity,
      },
    };
  }

  async supplierToday(user: { id: string; role: UserRole }) {
    const farmToday = await this.farmToday(user);
    const supplierId = getSupplierIdOrThrow(user);
    const today = farmToday.date;
    const rows = await this.deliveriesRepo.find({
      where: { supplierId, deliveryDate: today },
    });
    const summary = {
      date: today,
      total: farmToday.totalCount,
      pending: farmToday.pendingCount,
      delivered: farmToday.deliveredCount,
      skipped: farmToday.skippedCount,
      cancelled: rows.filter((r) => r.status === DeliveryStatus.CANCELLED)
        .length,
      scheduledQuantity: farmToday.scheduledQuantity,
      customerExtraQuantity: farmToday.customerExtraQuantity,
      staffExtraQuantity: farmToday.staffExtraQuantity,
      totalExtraQuantity: farmToday.totalExtraQuantity,
      totalDeliveredQuantity: farmToday.totalDeliveredQuantity,
      editedDeliveryCount: farmToday.editedDeliveryCount,
    };
    return { summary, deliveries: rows };
  }

  async supplierMonth(user: { id: string; role: UserRole }, month?: string) {
    const supplierId = getSupplierIdOrThrow(user);
    const billingMonth = month
      ? month.length === 7
        ? `${month}-01`
        : month
      : this.currentMonthStart();
    const monthEnd = this.endOfMonth(billingMonth);

    const deliveries = await this.deliveriesRepo
      .createQueryBuilder('d')
      .where('d.supplier_id = :supplierId', { supplierId })
      .andWhere('d.delivery_date BETWEEN :start AND :end', {
        start: billingMonth,
        end: monthEnd,
      })
      .getMany();

    const bills = await this.billsRepo.find({
      where: { supplierId, billingMonth },
    });
    const payments = await this.paymentsRepo
      .createQueryBuilder('p')
      .where('p.supplier_id = :supplierId', { supplierId })
      .andWhere('p.payment_date BETWEEN :start AND :end', {
        start: billingMonth,
        end: monthEnd,
      })
      .getMany();

    const milkAmount = deliveries
      .filter((d) => d.status === DeliveryStatus.DELIVERED)
      .reduce((a, d) => a + Number(d.amount), 0)
      .toFixed(2);
    const collected = payments
      .reduce((a, p) => a + Number(p.amount), 0)
      .toFixed(2);
    const outstanding = bills
      .reduce((a, b) => a + Number(b.remainingBalance), 0)
      .toFixed(2);

    return {
      billingMonth,
      deliveryCount: deliveries.length,
      deliveredCount: deliveries.filter(
        (d) => d.status === DeliveryStatus.DELIVERED,
      ).length,
      milkAmount,
      collected,
      outstanding,
      billCount: bills.length,
    };
  }

  async adminSummary() {
    const [suppliers, customers, deliveries, outstanding] = await Promise.all([
      this.usersRepo.count({ where: { role: UserRole.FARM_OWNER } }),
      this.customersRepo.count(),
      this.deliveriesRepo.count(),
      this.billsRepo
        .createQueryBuilder('b')
        .select('COALESCE(SUM(b.remaining_balance),0)', 'total')
        .where('b.status NOT IN (:...statuses)', {
          statuses: [BillStatus.VOID, BillStatus.PAID],
        })
        .getRawOne<{ total: string }>(),
    ]);
    return {
      suppliers,
      customers,
      deliveries,
      outstandingBalance: String(outstanding?.total ?? '0'),
    };
  }

  async adminGrowth() {
    const rows = await this.usersRepo
      .createQueryBuilder('u')
      .select("to_char(date_trunc('month', u.created_at), 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('u.role = :role', { role: UserRole.FARM_OWNER })
      .groupBy("date_trunc('month', u.created_at)")
      .orderBy("date_trunc('month', u.created_at)", 'ASC')
      .getRawMany<{ month: string; count: string }>();
    return { supplierGrowth: rows };
  }

  async adminRevenue() {
    const rows = await this.paymentsRepo
      .createQueryBuilder('p')
      .select(
        "to_char(date_trunc('month', p.payment_date), 'YYYY-MM')",
        'month',
      )
      .addSelect('COALESCE(SUM(p.amount),0)', 'revenue')
      .groupBy("date_trunc('month', p.payment_date)")
      .orderBy("date_trunc('month', p.payment_date)", 'ASC')
      .getRawMany<{ month: string; revenue: string }>();
    return {
      revenueByMonth: rows.map((r) => ({
        month: r.month,
        revenue: String(r.revenue),
      })),
    };
  }

  private currentMonthStart(): string {
    const today = todayIso();
    return `${today.slice(0, 7)}-01`;
  }

  private endOfMonth(billingMonth: string): string {
    const [y, m] = billingMonth.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0));
    return `${y}-${String(m).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
  }
}

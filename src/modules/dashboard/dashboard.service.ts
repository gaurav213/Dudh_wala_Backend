import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillStatus, DeliveryStatus, UserRole } from '../../common/enums';
import { getSupplierIdOrThrow } from '../../common/utils/ownership.util';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { Customer } from '../customers/entities/customer.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
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

  async supplierToday(user: { id: string; role: UserRole }) {
    const supplierId = getSupplierIdOrThrow(user);
    const today = this.todayInTz();
    const rows = await this.deliveriesRepo.find({
      where: { supplierId, deliveryDate: today },
    });
    const summary = {
      date: today,
      total: rows.length,
      pending: rows.filter((r) => r.status === DeliveryStatus.PENDING).length,
      delivered: rows.filter((r) => r.status === DeliveryStatus.DELIVERED)
        .length,
      skipped: rows.filter((r) => r.status === DeliveryStatus.SKIPPED).length,
      cancelled: rows.filter((r) => r.status === DeliveryStatus.CANCELLED)
        .length,
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

  private todayInTz(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private currentMonthStart(): string {
    const today = this.todayInTz();
    return `${today.slice(0, 7)}-01`;
  }

  private endOfMonth(billingMonth: string): string {
    const [y, m] = billingMonth.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0));
    return `${y}-${String(m).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
  }
}

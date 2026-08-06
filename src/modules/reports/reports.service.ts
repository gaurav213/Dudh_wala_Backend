import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillStatus, UserRole } from '../../common/enums';
import { getSupplierIdOrThrow } from '../../common/utils/ownership.util';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { Payment } from '../payments/entities/payment.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(MonthlyBill)
    private readonly billsRepo: Repository<MonthlyBill>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
  ) {}

  async deliveriesReport(
    user: { id: string; role: UserRole },
    filters: { dateFrom?: string; dateTo?: string; customerId?: string },
  ) {
    const supplierId =
      user.role === UserRole.PLATFORM_OWNER
        ? undefined
        : getSupplierIdOrThrow(user);
    const qb = this.deliveriesRepo.createQueryBuilder('d');
    if (supplierId) qb.andWhere('d.supplier_id = :supplierId', { supplierId });
    if (filters.customerId)
      qb.andWhere('d.customer_id = :customerId', {
        customerId: filters.customerId,
      });
    if (filters.dateFrom)
      qb.andWhere('d.delivery_date >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    if (filters.dateTo)
      qb.andWhere('d.delivery_date <= :dateTo', { dateTo: filters.dateTo });
    qb.orderBy('d.delivery_date', 'ASC');
    const rows = await qb.getMany();
    return { count: rows.length, rows };
  }

  async billingReport(
    user: { id: string; role: UserRole },
    filters: { billingMonth?: string; customerId?: string },
  ) {
    const supplierId =
      user.role === UserRole.PLATFORM_OWNER
        ? undefined
        : getSupplierIdOrThrow(user);
    const qb = this.billsRepo.createQueryBuilder('b');
    if (supplierId) qb.andWhere('b.supplier_id = :supplierId', { supplierId });
    if (filters.customerId)
      qb.andWhere('b.customer_id = :customerId', {
        customerId: filters.customerId,
      });
    if (filters.billingMonth) {
      const month =
        filters.billingMonth.length === 7
          ? `${filters.billingMonth}-01`
          : filters.billingMonth;
      qb.andWhere('b.billing_month = :month', { month });
    }
    const rows = await qb.orderBy('b.billing_month', 'DESC').getMany();
    return { count: rows.length, rows };
  }

  async paymentsReport(
    user: { id: string; role: UserRole },
    filters: { dateFrom?: string; dateTo?: string; customerId?: string },
  ) {
    const supplierId =
      user.role === UserRole.PLATFORM_OWNER
        ? undefined
        : getSupplierIdOrThrow(user);
    const qb = this.paymentsRepo.createQueryBuilder('p');
    if (supplierId) qb.andWhere('p.supplier_id = :supplierId', { supplierId });
    if (filters.customerId)
      qb.andWhere('p.customer_id = :customerId', {
        customerId: filters.customerId,
      });
    if (filters.dateFrom)
      qb.andWhere('p.payment_date >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    if (filters.dateTo)
      qb.andWhere('p.payment_date <= :dateTo', { dateTo: filters.dateTo });
    const rows = await qb.orderBy('p.payment_date', 'DESC').getMany();
    return { count: rows.length, rows };
  }

  async outstandingBalances(user: { id: string; role: UserRole }) {
    const supplierId =
      user.role === UserRole.PLATFORM_OWNER
        ? undefined
        : getSupplierIdOrThrow(user);
    const qb = this.billsRepo
      .createQueryBuilder('b')
      .where('b.remaining_balance > 0')
      .andWhere('b.status NOT IN (:...statuses)', {
        statuses: [BillStatus.VOID, BillStatus.PAID],
      });
    if (supplierId) qb.andWhere('b.supplier_id = :supplierId', { supplierId });
    const rows = await qb.orderBy('b.remaining_balance', 'DESC').getMany();
    const total = rows
      .reduce((a, b) => a + Number(b.remainingBalance), 0)
      .toFixed(2);
    return { total, rows };
  }
}

import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { DeliveryStatus, PaymentStatus } from '../enums';
import { MilkDelivery } from '../../modules/deliveries/entities/milk-delivery.entity';
import { Payment } from '../../modules/payments/entities/payment.entity';

/**
 * Balance carried into `monthStart`: billable milk before it minus confirmed payments before it.
 * Same ledger as the farm dashboard, so it never depends on bills having been generated.
 */
export async function carriedBalance(
  deliveries: Repository<MilkDelivery>,
  payments: Repository<Payment>,
  customerIds: string[],
  monthStart: string,
): Promise<Decimal> {
  if (!customerIds.length) return new Decimal(0);
  const [milk, paid] = await Promise.all([
    deliveries
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.amount), 0)', 'total')
      .where('d.customer_id IN (:...customerIds)', { customerIds })
      .andWhere('d.delivery_date < :monthStart', { monthStart })
      .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
      .andWhere('d.confirmation_status NOT IN (:...excluded)', {
        excluded: ['CUSTOMER_REPORTED_NOT_RECEIVED', 'DISPUTED'],
      })
      .getRawOne<{ total: string }>(),
    payments
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.customer_id IN (:...customerIds)', { customerIds })
      .andWhere('p.payment_date < :monthStart', { monthStart })
      .andWhere('p.status = :status', { status: PaymentStatus.CONFIRMED })
      .getRawOne<{ total: string }>(),
  ]);
  return new Decimal(milk?.total ?? 0).minus(paid?.total ?? 0);
}

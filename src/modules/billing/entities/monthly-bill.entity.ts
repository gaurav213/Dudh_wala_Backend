import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { BillStatus } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { MonthlyBillItem } from './monthly-bill-item.entity';

@Entity('monthly_bills')
@Unique(['customerId', 'billingMonth'])
@Index(['supplierId', 'status'])
@Index(['customerId', 'billingMonth'])
export class MonthlyBill {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: User;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'billing_month', type: 'date' })
  billingMonth!: string;

  @Column({ name: 'total_delivery_days', type: 'int', default: 0 })
  totalDeliveryDays!: number;

  @Column({
    name: 'total_quantity',
    type: 'numeric',
    precision: 12,
    scale: 3,
    transformer: decimalTransformer,
    default: '0',
  })
  totalQuantity!: string;

  @Column({
    name: 'milk_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: '0.00',
  })
  milkAmount!: string;

  @Column({
    name: 'previous_balance',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: '0.00',
  })
  previousBalance!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: '0.00',
  })
  discount!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: '0.00',
  })
  adjustment!: string;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: '0.00',
  })
  totalAmount!: string;

  @Column({
    name: 'paid_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: '0.00',
  })
  paidAmount!: string;

  @Column({
    name: 'remaining_balance',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: '0.00',
  })
  remainingBalance!: string;

  @Column({ type: 'enum', enum: BillStatus, default: BillStatus.DRAFT })
  status!: BillStatus;

  @Column({ name: 'generated_at', type: 'timestamptz' })
  generatedAt!: Date;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => MonthlyBillItem, (item) => item.bill)
  items?: MonthlyBillItem[];
}

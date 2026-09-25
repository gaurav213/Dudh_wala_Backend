import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CashPaymentPurpose,
  PaymentMethod,
  PaymentStatus,
} from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { MonthlyBill } from '../../billing/entities/monthly-bill.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';

@Entity('payments')
@Index(['customerId', 'paymentDate'])
@Index(['billId'])
@Index(['status', 'paymentDate'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId!: string | null;

  @Column({
    type: 'enum',
    enum: CashPaymentPurpose,
    nullable: true,
  })
  purpose!: CashPaymentPurpose | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: User;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'bill_id', type: 'uuid', nullable: true })
  billId!: string | null;

  @ManyToOne(() => MonthlyBill, { nullable: true })
  @JoinColumn({ name: 'bill_id' })
  bill!: MonthlyBill | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: string;

  @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
    default: PaymentStatus.CONFIRMED,
  })
  status!: PaymentStatus;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate!: string;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenceNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({
    name: 'proof_image_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  proofImageUrl!: string | null;

  @Column({ name: 'client_reference_id', type: 'uuid', unique: true })
  clientReferenceId!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'recorded_by_user_id', type: 'uuid' })
  recordedByUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'recorded_by_user_id' })
  recordedByUser!: User;

  @Column({ name: 'confirmed_by_user_id', type: 'uuid', nullable: true })
  confirmedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'confirmed_by_user_id' })
  confirmedByUser!: User | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'rejection_note', type: 'text', nullable: true })
  rejectionNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

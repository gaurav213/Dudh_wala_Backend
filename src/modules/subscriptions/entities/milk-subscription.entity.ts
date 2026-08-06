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
  DeliveryShift,
  MilkType,
  SubscriptionStatus,
} from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';

@Entity('milk_subscriptions')
@Index(['supplierId', 'status'])
@Index(['customerId'])
export class MilkSubscription {
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

  @Column({ name: 'milk_type', type: 'enum', enum: MilkType })
  milkType!: MilkType;

  @Column({
    name: 'default_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  defaultQuantity!: string;

  @Column({
    name: 'rate_per_litre',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  ratePerLitre!: string;

  @Column({ name: 'delivery_shift', type: 'enum', enum: DeliveryShift })
  deliveryShift!: DeliveryShift;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status!: SubscriptionStatus;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

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
  SubscriptionScheduleType,
  SubscriptionStatus,
} from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';

@Entity('milk_subscriptions')
@Index(['supplierId', 'status'])
@Index(['customerId'])
@Index(['assignedDeliveryUserId'])
@Index(['farmId'])
export class MilkSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: User;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId!: string | null;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'customer_address_id', type: 'uuid', nullable: true })
  customerAddressId!: string | null;

  @Column({ name: 'farm_product_id', type: 'uuid', nullable: true })
  farmProductId!: string | null;

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

  @Column({
    name: 'schedule_type',
    type: 'enum',
    enum: SubscriptionScheduleType,
    default: SubscriptionScheduleType.EVERY_DAY,
  })
  scheduleType!: SubscriptionScheduleType;

  /** Weekday numbers 1=Mon … 7=Sun when schedule_type = CUSTOM */
  @Column({
    name: 'delivery_days',
    type: 'smallint',
    array: true,
    nullable: true,
  })
  deliveryDays!: number[] | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ name: 'paused_from', type: 'date', nullable: true })
  pausedFrom!: string | null;

  @Column({ name: 'paused_until', type: 'date', nullable: true })
  pausedUntil!: string | null;

  @Column({ name: 'holiday_dates', type: 'date', array: true, nullable: true })
  holidayDates!: string[] | null;

  @Column({ name: 'assigned_delivery_user_id', type: 'uuid', nullable: true })
  assignedDeliveryUserId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_delivery_user_id' })
  assignedDeliveryUser!: User | null;

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

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {
  DeliveryConfirmationStatus,
  DeliveryEditReviewStatus,
  DeliveryShift,
  DeliveryStatus,
} from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { Customer } from '../../customers/entities/customer.entity';
import { MilkSubscription } from '../../subscriptions/entities/milk-subscription.entity';
import { User } from '../../users/entities/user.entity';

@Entity('milk_deliveries')
@Unique(['subscriptionId', 'deliveryDate', 'deliveryShift'])
@Index(['supplierId', 'deliveryDate'])
@Index(['customerId', 'deliveryDate'])
@Index(['subscriptionId', 'deliveryDate'])
@Index(['assignedUserId', 'deliveryDate'])
@Index(['customerUserId', 'deliveryDate'])
@Index(['status'])
@Index(['confirmationStatus'])
export class MilkDelivery {
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

  @Column({ name: 'customer_user_id', type: 'uuid', nullable: true })
  customerUserId!: string | null;

  @Column({ name: 'customer_address_id', type: 'uuid', nullable: true })
  customerAddressId!: string | null;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @ManyToOne(() => MilkSubscription)
  @JoinColumn({ name: 'subscription_id' })
  subscription!: MilkSubscription;

  @Column({ name: 'farm_product_id', type: 'uuid', nullable: true })
  farmProductId!: string | null;

  @Column({ name: 'assigned_user_id', type: 'uuid', nullable: true })
  assignedUserId!: string | null;

  @Column({ name: 'delivered_by_user_id', type: 'uuid', nullable: true })
  deliveredByUserId!: string | null;

  @Column({ name: 'delivery_date', type: 'date' })
  deliveryDate!: string;

  @Column({ name: 'delivery_shift', type: 'enum', enum: DeliveryShift })
  deliveryShift!: DeliveryShift;

  /** Legacy expected/delivered qty — kept in sync with expected total. */
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  quantity!: string;

  @Column({
    name: 'scheduled_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  scheduledQuantity!: string;

  @Column({
    name: 'customer_extra_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  customerExtraQuantity!: string;

  @Column({
    name: 'staff_extra_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  staffExtraQuantity!: string;

  @Column({
    name: 'final_delivered_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  finalDeliveredQuantity!: string | null;

  @Column({
    name: 'rate_per_litre',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  ratePerLitre!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: string;

  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status!: DeliveryStatus;

  @Column({
    name: 'confirmation_status',
    type: 'enum',
    enum: DeliveryConfirmationStatus,
    default: DeliveryConfirmationStatus.NOT_CONFIRMED,
  })
  confirmationStatus!: DeliveryConfirmationStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'delivery_notes', type: 'text', nullable: true })
  deliveryNotes!: string | null;

  @Column({ name: 'is_edited', type: 'boolean', default: false })
  isEdited!: boolean;

  @Column({ name: 'last_edited_at', type: 'timestamptz', nullable: true })
  lastEditedAt!: Date | null;

  @Column({ name: 'last_edited_by_user_id', type: 'uuid', nullable: true })
  lastEditedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'last_edited_by_user_id' })
  lastEditedByUser?: User | null;

  @Column({
    name: 'edit_review_status',
    type: 'enum',
    enum: DeliveryEditReviewStatus,
    default: DeliveryEditReviewStatus.NOT_REQUIRED,
  })
  editReviewStatus!: DeliveryEditReviewStatus;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'delivery_sequence', type: 'int', nullable: true })
  deliverySequence!: number | null;

  @Column({
    name: 'client_reference_id',
    type: 'uuid',
    unique: true,
  })
  clientReferenceId!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

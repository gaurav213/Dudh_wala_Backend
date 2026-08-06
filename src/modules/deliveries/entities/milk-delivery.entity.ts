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
import { DeliveryShift, DeliveryStatus } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { Customer } from '../../customers/entities/customer.entity';
import { MilkSubscription } from '../../subscriptions/entities/milk-subscription.entity';
import { User } from '../../users/entities/user.entity';

@Entity('milk_deliveries')
@Unique(['subscriptionId', 'deliveryDate', 'deliveryShift'])
@Index(['supplierId', 'deliveryDate'])
@Index(['customerId', 'deliveryDate'])
@Index(['subscriptionId', 'deliveryDate'])
export class MilkDelivery {
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

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @ManyToOne(() => MilkSubscription)
  @JoinColumn({ name: 'subscription_id' })
  subscription!: MilkSubscription;

  @Column({ name: 'delivery_date', type: 'date' })
  deliveryDate!: string;

  @Column({ name: 'delivery_shift', type: 'enum', enum: DeliveryShift })
  deliveryShift!: DeliveryShift;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  quantity!: string;

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

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

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

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExtraRequestStatus } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { MilkSubscription } from '../../subscriptions/entities/milk-subscription.entity';
import { User } from '../../users/entities/user.entity';
import { MilkDelivery } from './milk-delivery.entity';

@Entity('delivery_extra_requests')
@Index(['deliveryDate', 'status'])
@Index(['farmId', 'deliveryDate'])
export class DeliveryExtraRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @Column({ name: 'customer_user_id', type: 'uuid' })
  customerUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customer_user_id' })
  customerUser!: User;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @ManyToOne(() => MilkSubscription)
  @JoinColumn({ name: 'subscription_id' })
  subscription!: MilkSubscription;

  @Column({ name: 'delivery_id', type: 'uuid', nullable: true })
  deliveryId!: string | null;

  @ManyToOne(() => MilkDelivery, { nullable: true })
  @JoinColumn({ name: 'delivery_id' })
  delivery!: MilkDelivery | null;

  @Column({ name: 'delivery_date', type: 'date' })
  deliveryDate!: string;

  @Column({
    name: 'requested_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  requestedQuantity!: string;

  @Column({
    type: 'enum',
    enum: ExtraRequestStatus,
    default: ExtraRequestStatus.PENDING,
  })
  status!: ExtraRequestStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt!: Date;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

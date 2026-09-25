import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReviewStatus } from '../../../common/enums';

@Entity('customer_reviews')
@Index(['customerUserId'])
@Index(['farmId'])
export class CustomerReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @Column({ name: 'customer_user_id', type: 'uuid' })
  customerUserId!: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'delivery_id', type: 'uuid', nullable: true })
  deliveryId!: string | null;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId!: string | null;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ name: 'communication_rating', type: 'smallint', nullable: true })
  communicationRating!: number | null;

  @Column({
    name: 'address_accuracy_rating',
    type: 'smallint',
    nullable: true,
  })
  addressAccuracyRating!: number | null;

  @Column({
    name: 'payment_reliability_rating',
    type: 'smallint',
    nullable: true,
  })
  paymentReliabilityRating!: number | null;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'customer_response', type: 'text', nullable: true })
  customerResponse!: string | null;

  @Column({
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.PUBLISHED,
  })
  status!: ReviewStatus;

  @Column({ name: 'reported_at', type: 'timestamptz', nullable: true })
  reportedAt!: Date | null;

  @Column({ name: 'report_reason', type: 'text', nullable: true })
  reportReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

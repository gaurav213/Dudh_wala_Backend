import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ReviewStatus } from '../../../common/enums';

/** Customer rating a farm (marketplace discovery). */
@Entity('farm_reviews')
@Unique(['farmId', 'customerUserId'])
@Index(['farmId'])
export class FarmReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @Column({ name: 'customer_user_id', type: 'uuid' })
  customerUserId!: string;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({
    type: 'enum',
    enum: ReviewStatus,
    enumName: 'customer_review_status_enum',
    default: ReviewStatus.PUBLISHED,
  })
  status!: ReviewStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

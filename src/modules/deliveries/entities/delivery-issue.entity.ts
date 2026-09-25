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
import { DeliveryIssueStatus, DeliveryIssueType } from '../../../common/enums';
import { MilkDelivery } from './milk-delivery.entity';

@Entity('delivery_issues')
@Index(['deliveryId'])
export class DeliveryIssue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'delivery_id', type: 'uuid' })
  deliveryId!: string;

  @ManyToOne(() => MilkDelivery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delivery_id' })
  delivery!: MilkDelivery;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId!: string | null;

  @Column({ name: 'reported_by_user_id', type: 'uuid' })
  reportedByUserId!: string;

  @Column({ name: 'issue_type', type: 'enum', enum: DeliveryIssueType })
  issueType!: DeliveryIssueType;

  @Column({
    type: 'enum',
    enum: DeliveryIssueStatus,
    default: DeliveryIssueStatus.OPEN,
  })
  status!: DeliveryIssueStatus;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes!: string | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId!: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

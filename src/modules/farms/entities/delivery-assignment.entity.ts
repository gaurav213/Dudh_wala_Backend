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
import { DeliveryAssignmentStatus } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Farm } from './farm.entity';

/**
 * Minimal delivery-assignment record linking a farm's delivery staff member
 * to a subscription and/or a specific delivery. Full assignment workflows
 * (auto-rotation, route planning) are out of scope for Phase 4.
 */
@Entity('delivery_assignments')
export class DeliveryAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm!: Farm;

  @Index()
  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId!: string | null;

  @Column({ name: 'delivery_id', type: 'uuid', nullable: true })
  deliveryId!: string | null;

  @Index()
  @Column({ name: 'assignee_user_id', type: 'uuid' })
  assigneeUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assignee_user_id' })
  assignee!: User;

  @Column({ name: 'assigned_by_user_id', type: 'uuid' })
  assignedByUserId!: string;

  @Column({
    type: 'enum',
    enum: DeliveryAssignmentStatus,
    default: DeliveryAssignmentStatus.ACTIVE,
  })
  status!: DeliveryAssignmentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

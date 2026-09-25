import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PushDeliveryStatus } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { AppNotification } from './notification.entity';

@Entity('notification_recipients')
@Unique(['notificationId', 'userId'])
@Index(['userId', 'readAt'])
export class NotificationRecipient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId!: string;

  @ManyToOne(() => AppNotification, (n) => n.recipients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'notification_id' })
  notification!: AppNotification;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({
    name: 'push_status',
    type: 'enum',
    enum: PushDeliveryStatus,
    default: PushDeliveryStatus.PENDING,
  })
  pushStatus!: PushDeliveryStatus;

  @Column({ name: 'push_error', type: 'text', nullable: true })
  pushError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

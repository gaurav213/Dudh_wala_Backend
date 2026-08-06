import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('sync_operations')
export class SyncOperation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'operation_id', type: 'uuid', unique: true })
  operationId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'device_id', type: 'varchar', length: 100 })
  deviceId!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ name: 'operation_type', type: 'varchar', length: 20 })
  operationType!: string;

  @Column({ name: 'result_status', type: 'varchar', length: 20 })
  resultStatus!: string;

  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt!: Date;

  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true })
  errorCode!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

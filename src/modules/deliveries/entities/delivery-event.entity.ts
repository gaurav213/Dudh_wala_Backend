import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DeliveryEventType } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { MilkDelivery } from './milk-delivery.entity';

@Entity('delivery_events')
@Index(['deliveryId', 'createdAt'])
export class DeliveryEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'delivery_id', type: 'uuid' })
  deliveryId!: string;

  @ManyToOne(() => MilkDelivery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delivery_id' })
  delivery!: MilkDelivery;

  @Column({ name: 'event_type', type: 'enum', enum: DeliveryEventType })
  eventType!: DeliveryEventType;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 40, nullable: true })
  actorRole!: string | null;

  @Column({
    name: 'previous_status',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  previousStatus!: string | null;

  @Column({ name: 'new_status', type: 'varchar', length: 40, nullable: true })
  newStatus!: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  quantity!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
  })
  latitude!: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
  })
  longitude!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

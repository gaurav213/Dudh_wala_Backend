import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DeliveryEditReason } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { User } from '../../users/entities/user.entity';
import { MilkDelivery } from './milk-delivery.entity';

@Entity('delivery_edit_history')
@Index(['deliveryId', 'editedAt'])
@Index(['editedByUserId', 'editedAt'])
export class DeliveryEditHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'delivery_id', type: 'uuid' })
  deliveryId!: string;

  @ManyToOne(() => MilkDelivery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delivery_id' })
  delivery!: MilkDelivery;

  @Column({ name: 'edited_by_user_id', type: 'uuid' })
  editedByUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'edited_by_user_id' })
  editedByUser!: User;

  @Column({ name: 'edited_by_role', type: 'varchar', length: 40 })
  editedByRole!: string;

  @Column({
    name: 'previous_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  previousQuantity!: string;

  @Column({
    name: 'new_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  newQuantity!: string;

  @Column({
    name: 'previous_extra_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  previousExtraQuantity!: string;

  @Column({
    name: 'new_extra_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  newExtraQuantity!: string;

  @Column({
    name: 'previous_staff_extra_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  previousStaffExtraQuantity!: string;

  @Column({
    name: 'new_staff_extra_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  newStaffExtraQuantity!: string;

  @Column({
    name: 'previous_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  previousAmount!: string;

  @Column({
    name: 'new_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  newAmount!: string;

  @Column({
    name: 'edit_reason',
    type: 'enum',
    enum: DeliveryEditReason,
  })
  editReason!: DeliveryEditReason;

  @Column({ name: 'edit_note', type: 'text', nullable: true })
  editNote!: string | null;

  @CreateDateColumn({ name: 'edited_at', type: 'timestamptz' })
  editedAt!: Date;
}

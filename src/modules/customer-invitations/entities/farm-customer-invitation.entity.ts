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
import { DeliveryShift, InvitationStatus } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { FarmMilkProduct } from '../../farms/entities/farm-milk-product.entity';
import { Farm } from '../../farms/entities/farm.entity';

@Entity('farm_customer_invitations')
@Index(['farmId', 'status'])
export class FarmCustomerInvitation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm!: Farm;

  @Index()
  @Column({ name: 'mobile_number', type: 'varchar', length: 20 })
  mobileNumber!: string;

  @Column({
    name: 'customer_name',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  customerName!: string | null;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => FarmMilkProduct)
  @JoinColumn({ name: 'product_id' })
  product!: FarmMilkProduct;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  quantity!: string;

  @Column({ name: 'delivery_shift', type: 'enum', enum: DeliveryShift })
  deliveryShift!: DeliveryShift;

  @Column({
    name: 'proposed_rate',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  proposedRate!: string;

  @Column({ name: 'preferred_start_date', type: 'date' })
  preferredStartDate!: string;

  @Column({ name: 'delivery_instructions', type: 'text', nullable: true })
  deliveryInstructions!: string | null;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  status!: InvitationStatus;

  @Column({ name: 'invited_by_user_id', type: 'uuid' })
  invitedByUserId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

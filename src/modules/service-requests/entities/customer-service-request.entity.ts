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
import { DeliveryShift, ServiceRequestStatus, SubscriptionScheduleType } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { CustomerAddress } from '../../customer-addresses/entities/customer-address.entity';
import { FarmMilkProduct } from '../../farms/entities/farm-milk-product.entity';
import { Farm } from '../../farms/entities/farm.entity';
import { User } from '../../users/entities/user.entity';

@Entity('customer_service_requests')
@Index(['farmId', 'status'])
export class CustomerServiceRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm!: Farm;

  @Index()
  @Column({ name: 'customer_user_id', type: 'uuid' })
  customerUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customer_user_id' })
  customerUser!: User;

  @Column({ name: 'address_id', type: 'uuid' })
  addressId!: string;

  @ManyToOne(() => CustomerAddress)
  @JoinColumn({ name: 'address_id' })
  address!: CustomerAddress;

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
    name: 'schedule_type',
    type: 'enum',
    enum: SubscriptionScheduleType,
    default: SubscriptionScheduleType.EVERY_DAY,
  })
  scheduleType!: SubscriptionScheduleType;

  @Column({ name: 'preferred_start_date', type: 'date' })
  preferredStartDate!: string;

  @Column({ name: 'delivery_instructions', type: 'text', nullable: true })
  deliveryInstructions!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: ServiceRequestStatus,
    default: ServiceRequestStatus.PENDING,
  })
  status!: ServiceRequestStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({
    name: 'assigned_member_user_id',
    type: 'uuid',
    nullable: true,
  })
  assignedMemberUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

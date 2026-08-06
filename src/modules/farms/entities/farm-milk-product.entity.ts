import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeliveryShift, MilkType } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { Farm } from './farm.entity';

@Entity('farm_milk_products')
@Index(['farmId', 'isAvailable'])
export class FarmMilkProduct {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm!: Farm;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'milk_type', type: 'enum', enum: MilkType })
  milkType!: MilkType;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    name: 'current_rate_per_litre',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  currentRatePerLitre!: string;

  @Column({
    name: 'minimum_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  minimumQuantity!: string;

  @Column({
    name: 'maximum_quantity',
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  maximumQuantity!: string | null;

  @Column({ name: 'available_shifts', type: 'jsonb' })
  availableShifts!: DeliveryShift[];

  @Column({ name: 'is_available', type: 'boolean', default: true })
  isAvailable!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

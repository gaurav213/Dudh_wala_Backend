import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { User } from '../../users/entities/user.entity';
import { FarmMilkProduct } from './farm-milk-product.entity';

@Entity('milk_rate_history')
@Index(['farmProductId', 'effectiveFrom'])
export class MilkRateHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'farm_product_id', type: 'uuid' })
  farmProductId!: string;

  @ManyToOne(() => FarmMilkProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_product_id' })
  farmProduct!: FarmMilkProduct;

  @Column({
    name: 'rate_per_litre',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  ratePerLitre!: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

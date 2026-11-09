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
import { Farm } from './farm.entity';

@Entity('dairy_payments')
@Index(['farmId', 'paidOn'])
export class DairyPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm!: Farm;

  @Column({ name: 'dairy_name', type: 'varchar', length: 150 })
  dairyName!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: string;

  @Column({ name: 'paid_on', type: 'date' })
  paidOn!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

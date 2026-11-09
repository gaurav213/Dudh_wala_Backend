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

@Entity('dairy_slips')
@Index(['farmId', 'slipDate'])
export class DairySlip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm!: Farm;

  @Column({ name: 'dairy_name', type: 'varchar', length: 150 })
  dairyName!: string;

  @Column({ name: 'slip_date', type: 'date' })
  slipDate!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    transformer: decimalTransformer,
  })
  litres!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  rate!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: string;

  @Column({
    name: 'fat_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  fatPercent!: string | null;

  @Column({ name: 'raw_numbers', type: 'jsonb', nullable: true })
  rawNumbers!: string[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

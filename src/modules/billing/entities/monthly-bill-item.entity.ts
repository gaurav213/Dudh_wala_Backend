import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BillItemType } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { MilkDelivery } from '../../deliveries/entities/milk-delivery.entity';
import { MonthlyBill } from './monthly-bill.entity';

@Entity('monthly_bill_items')
export class MonthlyBillItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'bill_id', type: 'uuid' })
  billId!: string;

  @ManyToOne(() => MonthlyBill, (bill) => bill.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bill_id' })
  bill!: MonthlyBill;

  @Column({ name: 'delivery_id', type: 'uuid', nullable: true })
  deliveryId!: string | null;

  @ManyToOne(() => MilkDelivery, { nullable: true })
  @JoinColumn({ name: 'delivery_id' })
  delivery!: MilkDelivery | null;

  @Column({ name: 'item_date', type: 'date' })
  itemDate!: string;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
    default: '0',
  })
  quantity!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: '0.00',
  })
  rate!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
    default: '0.00',
  })
  amount!: string;

  @Column({ name: 'item_type', type: 'enum', enum: BillItemType })
  itemType!: BillItemType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

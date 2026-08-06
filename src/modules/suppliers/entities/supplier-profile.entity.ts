import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('supplier_profiles')
export class SupplierProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @OneToOne(() => User, (user) => user.supplierProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'business_name', type: 'varchar', length: 150 })
  businessName!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({
    name: 'default_currency',
    type: 'varchar',
    length: 3,
    default: 'INR',
  })
  defaultCurrency!: string;

  @Column({
    name: 'default_timezone',
    type: 'varchar',
    length: 50,
    default: 'Asia/Kolkata',
  })
  defaultTimezone!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

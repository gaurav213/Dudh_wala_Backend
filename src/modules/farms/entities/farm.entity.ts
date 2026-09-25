import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FarmStatus } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { FarmMember } from './farm-member.entity';

@Entity('farms')
export class Farm {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({
    name: 'business_name',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  businessName!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** ISO language codes the farm supports (max 5). e.g. ["mr","hi","en"] */
  @Column({ name: 'spoken_languages', type: 'jsonb', default: () => "'[]'" })
  spokenLanguages!: string[];

  @Index()
  @Column({ name: 'mobile_number', type: 'varchar', length: 20 })
  mobileNumber!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email!: string | null;

  @Column({ name: 'address_line_1', type: 'varchar', length: 255 })
  addressLine1!: string;

  @Column({
    name: 'address_line_2',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  addressLine2!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  area!: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100 })
  state!: string;

  @Index()
  @Column({ name: 'postal_code', type: 'varchar', length: 20 })
  postalCode!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Column({
    type: 'enum',
    enum: FarmStatus,
    default: FarmStatus.PENDING_APPROVAL,
  })
  status!: FarmStatus;

  @Column({ name: 'approval_notes', type: 'text', nullable: true })
  approvalNotes!: string | null;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by_user_id' })
  approvedByUser?: User | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt!: Date | null;

  @Column({
    name: 'deletion_requested_at',
    type: 'timestamptz',
    nullable: true,
  })
  deletionRequestedAt!: Date | null;

  /**
   * Legacy link to the farm-owner user who originally registered.
   * Used to backfill and bridge supplier_id ledger until later phases.
   */
  @Index()
  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User;

  @OneToMany(() => FarmMember, (m) => m.farm)
  members?: FarmMember[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

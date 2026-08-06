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
import { ServiceAreaStatus } from '../../../common/enums';
import { Farm } from './farm.entity';

@Entity('farm_service_areas')
@Index(['farmId', 'status'])
export class FarmServiceArea {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm!: Farm;

  @Column({ name: 'area_name', type: 'varchar', length: 100 })
  areaName!: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100 })
  state!: string;

  @Index()
  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Column({
    name: 'service_radius_km',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  serviceRadiusKm!: string | null;

  @Column({
    type: 'enum',
    enum: ServiceAreaStatus,
    default: ServiceAreaStatus.ACTIVE,
  })
  status!: ServiceAreaStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

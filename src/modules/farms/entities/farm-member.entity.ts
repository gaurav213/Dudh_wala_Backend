import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { FarmMemberRole, FarmMemberStatus } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Farm } from './farm.entity';

@Entity('farm_members')
@Unique(['farmId', 'userId'])
export class FarmMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'farm_id', type: 'uuid' })
  farmId!: string;

  @ManyToOne(() => Farm, (farm) => farm.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm!: Farm;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'member_role',
    type: 'enum',
    enum: FarmMemberRole,
  })
  memberRole!: FarmMemberRole;

  @Column({
    type: 'enum',
    enum: FarmMemberStatus,
    default: FarmMemberStatus.ACTIVE,
  })
  status!: FarmMemberStatus;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

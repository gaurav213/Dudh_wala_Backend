import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UserRole, UserStatus } from '../../common/enums';
import { normalizeMobileNumber } from '../../common/utils/mobile.util';
import { User } from './entities/user.entity';

function safeNormalizeMobile(mobileNumber: string): string {
  try {
    return normalizeMobileNumber(mobileNumber);
  } catch (e) {
    throw new BadRequestException(
      e instanceof Error ? e.message : 'Invalid mobile number',
    );
  }
}

/** Fits `users.mobile_number` varchar(20). */
export function deletedMobileTombstone(userId: string): string {
  return `d${userId.replace(/-/g, '').slice(0, 19)}`.slice(0, 20);
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByMobile(mobileNumber: string): Promise<User | null> {
    const normalized = safeNormalizeMobile(mobileNumber);
    return this.usersRepo.findOne({ where: { mobileNumber: normalized } });
  }

  async findByMobileWithPassword(mobileNumber: string): Promise<User | null> {
    const normalized = safeNormalizeMobile(mobileNumber);
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.mobileNumber = :mobileNumber', { mobileNumber: normalized })
      .getOne();
  }

  async createUser(params: {
    name: string;
    mobileNumber: string;
    password: string;
    role: UserRole;
    preferredLanguage?: string;
    timezone?: string;
    bcryptRounds: number;
  }): Promise<User> {
    const mobileNumber = safeNormalizeMobile(params.mobileNumber);
    const existing = await this.usersRepo.findOne({ where: { mobileNumber } });
    if (existing) {
      throw new ConflictException('Mobile number already registered');
    }
    const passwordHash = await bcrypt.hash(
      params.password,
      params.bcryptRounds,
    );
    const user = this.usersRepo.create({
      name: params.name,
      mobileNumber,
      passwordHash,
      role: params.role,
      status: UserStatus.ACTIVE,
      preferredLanguage: params.preferredLanguage || 'en',
      timezone: params.timezone || 'Asia/Kolkata',
    });
    return this.usersRepo.save(user);
  }

  async updateProfile(
    userId: string,
    data: Partial<
      Pick<
        User,
        'name' | 'email' | 'preferredLanguage' | 'timezone' | 'avatarUrl'
      >
    >,
  ): Promise<User> {
    const user = await this.findByIdOrFail(userId);
    Object.assign(user, data);
    return this.usersRepo.save(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    bcryptRounds: number,
  ): Promise<void> {
    const user = await this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw new NotFoundException('User not found');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new ConflictException('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(newPassword, bcryptRounds);
    await this.usersRepo.save(user);
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.usersRepo.update(userId, { lastLoginAt: new Date() });
  }

  /**
   * Soft-delete + anonymize PII so the mobile number can be re-registered.
   * Business history (deliveries/bills) remains for the farm ledger.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.findByIdOrFail(userId);
    const tombstone = deletedMobileTombstone(userId);
    const passwordHash = await bcrypt.hash(`deleted-${userId}-${Date.now()}`, 10);
    await this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({
        status: UserStatus.INACTIVE,
        name: 'Deleted user',
        email: null,
        avatarUrl: null,
        mobileNumber: tombstone,
        passwordHash,
      })
      .where('id = :id', { id: userId })
      .execute();
    try {
      await this.usersRepo.softDelete(userId);
    } catch {
      // PII already anonymized; hide-row is best-effort.
    }
  }

  toSafeUser(user: User) {
    const { passwordHash: _passwordHash, ...safe } = user as User & {
      passwordHash?: string;
    };
    return safe;
  }
}

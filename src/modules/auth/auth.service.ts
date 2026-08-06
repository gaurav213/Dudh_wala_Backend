import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { UserRole, UserStatus } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { FarmsService } from '../farms/farms.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { UsersService } from '../users/users.service';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterCustomerDto,
  RegisterFarmOwnerDto,
  RegisterSupplierDto,
  UpdateProfileDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly suppliersService: SuppliersService,
    private readonly farmsService: FarmsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  /**
   * Preferred registration: farm owner + farm (PENDING_APPROVAL unless AUTO_APPROVE_FARMS).
   */
  async registerFarmOwner(dto: RegisterFarmOwnerDto) {
    const rounds = this.configService.getOrThrow<number>('auth.bcryptRounds');
    const user = await this.usersService.createUser({
      name: dto.name,
      mobileNumber: dto.mobileNumber,
      password: dto.password,
      role: UserRole.FARM_OWNER,
      bcryptRounds: rounds,
    });

    // Legacy bridge profile for supplier_id ledger tables until later phases.
    const profile = await this.suppliersService.createProfile({
      userId: user.id,
      businessName: dto.businessName || dto.farmName,
      address: dto.addressLine1,
    });

    const farm = await this.farmsService.createFarmForOwner(
      { id: user.id, role: UserRole.FARM_OWNER },
      {
        name: dto.farmName,
        businessName: dto.businessName,
        description: dto.description,
        email: dto.email,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
      },
      dto.mobileNumber,
    );

    await this.auditService.log({
      actorUserId: user.id,
      farmId: farm.id,
      supplierId: user.id,
      entityType: 'USER',
      entityId: user.id,
      action: 'FARM_OWNER_REGISTERED',
      newValues: { farmId: farm.id, farmStatus: farm.status },
    });

    const tokens = await this.issueTokens(user.id, user.role);
    return {
      user: this.usersService.toSafeUser(user),
      farm,
      supplierProfile: profile,
      ...tokens,
    };
  }

  /** Customer registration: user only, no farm association. */
  async registerCustomer(dto: RegisterCustomerDto) {
    const rounds = this.configService.getOrThrow<number>('auth.bcryptRounds');
    const user = await this.usersService.createUser({
      name: dto.name,
      mobileNumber: dto.mobileNumber,
      password: dto.password,
      role: UserRole.CUSTOMER,
      bcryptRounds: rounds,
    });

    await this.auditService.log({
      actorUserId: user.id,
      entityType: 'USER',
      entityId: user.id,
      action: 'CUSTOMER_REGISTERED',
    });

    const tokens = await this.issueTokens(user.id, user.role);
    return {
      user: this.usersService.toSafeUser(user),
      ...tokens,
    };
  }

  /** @deprecated Prefer register/farm-owner — kept for mobile backward compatibility. */
  async registerSupplier(dto: RegisterSupplierDto) {
    return this.registerFarmOwner({
      name: dto.name,
      mobileNumber: dto.mobileNumber,
      password: dto.password,
      farmName: dto.businessName,
      businessName: dto.businessName,
      addressLine1: dto.address || 'Address pending',
      area: 'Pending',
      city: 'Pending',
      state: 'Pending',
      postalCode: '000000',
    });
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByMobileWithPassword(
      dto.mobileNumber,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('Account is blocked');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.usersService.touchLastLogin(user.id);
    const tokens = await this.issueTokens(user.id, user.role, dto.deviceId);
    await this.auditService.log({
      actorUserId: user.id,
      supplierId: user.role === UserRole.FARM_OWNER ? user.id : null,
      entityType: 'USER',
      entityId: user.id,
      action: 'LOGIN',
    });
    return {
      user: this.usersService.toSafeUser(user),
      ...tokens,
    };
  }

  async refresh(refreshToken: string, deviceId?: string) {
    const hash = this.hashToken(refreshToken);
    const stored = await this.refreshRepo.findOne({
      where: { tokenHash: hash },
      relations: ['user'],
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    stored.revokedAt = new Date();
    await this.refreshRepo.save(stored);
    return this.issueTokens(stored.userId, stored.user.role, deviceId);
  }

  async logout(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    const stored = await this.refreshRepo.findOne({
      where: { tokenHash: hash },
    });
    if (stored && !stored.revokedAt) {
      stored.revokedAt = new Date();
      await this.refreshRepo.save(stored);
    }
    return { success: true };
  }

  async logoutAll(userId: string) {
    await this.refreshRepo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
    return { success: true };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findByIdOrFail(userId);
    const profile =
      user.role === UserRole.FARM_OWNER
        ? await this.suppliersService.findByUserId(userId)
        : null;
    const farms =
      user.role === UserRole.FARM_OWNER
        ? await this.farmsService.listMyFarms(userId)
        : [];
    return {
      user: this.usersService.toSafeUser(user),
      supplierProfile: profile,
      farms,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersService.updateProfile(userId, {
      name: dto.name,
      preferredLanguage: dto.preferredLanguage,
      timezone: dto.timezone,
    });
    let supplierProfile = null;
    if (user.role === UserRole.FARM_OWNER) {
      if (dto.businessName || dto.address !== undefined) {
        supplierProfile = await this.suppliersService.updateProfile(userId, {
          businessName: dto.businessName,
          address: dto.address,
        });
      } else {
        supplierProfile = await this.suppliersService.findByUserId(userId);
      }
    }
    return {
      user: this.usersService.toSafeUser(user),
      supplierProfile,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const rounds = this.configService.getOrThrow<number>('auth.bcryptRounds');
    await this.usersService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
      rounds,
    );
    await this.logoutAll(userId);
    await this.auditService.log({
      actorUserId: userId,
      entityType: 'USER',
      entityId: userId,
      action: 'PASSWORD_CHANGED',
    });
    return { success: true };
  }

  private async issueTokens(userId: string, role: UserRole, deviceId?: string) {
    const accessToken = await this.jwtService.signAsync({ sub: userId, role }, {
      secret: this.configService.getOrThrow<string>('auth.jwtAccessSecret'),
      expiresIn: this.configService.getOrThrow<string>(
        'auth.jwtAccessExpiresIn',
      ),
    } as Parameters<JwtService['signAsync']>[1]);
    const refreshToken = randomBytes(48).toString('hex');
    const expiresIn = this.configService.getOrThrow<string>(
      'auth.jwtRefreshExpiresIn',
    );
    const expiresAt = this.parseExpiry(expiresIn);
    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId,
        tokenHash: this.hashToken(refreshToken),
        deviceId: deviceId ?? null,
        expiresAt,
      }),
    );
    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseExpiry(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    const now = Date.now();
    if (!match) {
      return new Date(now + 30 * 24 * 60 * 60 * 1000);
    }
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return new Date(now + amount * multipliers[unit]);
  }
}

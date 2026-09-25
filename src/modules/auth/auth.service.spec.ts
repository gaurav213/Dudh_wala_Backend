import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '../../common/enums';
import { AuthService } from './auth.service';

const BCRYPT_ROUNDS = 4; // low cost factor keeps the spec fast; real config uses 12.

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    name: 'Asha',
    mobileNumber: '9876543210',
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    passwordHash: bcrypt.hashSync('irrelevant', BCRYPT_ROUNDS),
    ...overrides,
  };
}

function makeService() {
  const usersService = {
    createUser: jest.fn(),
    findByMobileWithPassword: jest.fn(),
    touchLastLogin: jest.fn().mockResolvedValue(undefined),
    toSafeUser: jest.fn((u: any) => {
      const { passwordHash: _passwordHash, ...safe } = u;
      return safe;
    }),
    findByIdOrFail: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn().mockResolvedValue(undefined),
  };
  const suppliersService = {
    createProfile: jest.fn(),
    findByUserId: jest.fn(),
    updateProfile: jest.fn(),
  };
  const farmsService = {
    createFarmForOwner: jest.fn(),
    listMyFarms: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  };
  const authConfig: Record<string, unknown> = {
    'auth.bcryptRounds': BCRYPT_ROUNDS,
    'auth.jwtAccessSecret': 'test-secret',
    'auth.jwtAccessExpiresIn': '15m',
    'auth.jwtRefreshExpiresIn': '365d',
  };
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (!(key in authConfig)) throw new Error(`Missing config ${key}`);
      return authConfig[key];
    }),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const refreshRepo = {
    findOne: jest.fn(),
    save: jest.fn((x: any) =>
      Promise.resolve({ id: x.id ?? 'refresh-1', ...x }),
    ),
    create: jest.fn((x: any) => x),
    createQueryBuilder: jest.fn(),
  };

  const service = new AuthService(
    usersService as any,
    suppliersService as any,
    farmsService as any,
    jwtService as any,
    configService as any,
    auditService as any,
    refreshRepo as any,
  );

  return {
    service,
    usersService,
    suppliersService,
    farmsService,
    jwtService,
    configService,
    auditService,
    refreshRepo,
  };
}

describe('AuthService', () => {
  describe('registration', () => {
    it('hashes with the configured bcrypt rounds and issues tokens on success', async () => {
      const { service, usersService, auditService, refreshRepo } =
        makeService();
      const createdUser = makeUser();
      usersService.createUser.mockResolvedValue(createdUser);

      const result = await service.registerCustomer({
        name: 'Asha',
        mobileNumber: '9876543210',
        password: 'Password123',
      });

      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.CUSTOMER,
          bcryptRounds: BCRYPT_ROUNDS,
          password: 'Password123',
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CUSTOMER_REGISTERED',
          actorUserId: createdUser.id,
        }),
      );
      expect(refreshRepo.save).toHaveBeenCalled();
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('propagates duplicate-mobile rejection without issuing tokens', async () => {
      const { service, usersService, refreshRepo } = makeService();
      usersService.createUser.mockRejectedValue(
        new ConflictException('Mobile number already registered'),
      );

      await expect(
        service.registerCustomer({
          name: 'Asha',
          mobileNumber: '9876543210',
          password: 'Password123',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(refreshRepo.save).not.toHaveBeenCalled();
    });

    it('creates the user, supplier profile, and farm, then issues tokens', async () => {
      const {
        service,
        usersService,
        suppliersService,
        farmsService,
        auditService,
      } = makeService();
      const createdUser = makeUser({ role: UserRole.FARM_OWNER });
      usersService.createUser.mockResolvedValue(createdUser);
      suppliersService.createProfile.mockResolvedValue({
        id: 'supplier-profile-1',
      });
      farmsService.createFarmForOwner.mockResolvedValue({
        id: 'farm-1',
        status: 'PENDING_APPROVAL',
      });

      const result = await service.registerFarmOwner({
        name: 'Asha',
        mobileNumber: '9876543210',
        password: 'Password123',
        farmName: 'Asha Dairy',
        businessName: 'Asha Dairy Pvt Ltd',
        addressLine1: '123 MG Road',
        area: 'Kothrud',
        city: 'Pune',
        state: 'MH',
        postalCode: '411038',
      });

      expect(farmsService.createFarmForOwner).toHaveBeenCalledWith(
        { id: createdUser.id, role: UserRole.FARM_OWNER },
        expect.objectContaining({ name: 'Asha Dairy', city: 'Pune' }),
        '9876543210',
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FARM_OWNER_REGISTERED',
          farmId: 'farm-1',
        }),
      );
      expect(result.farm).toEqual({ id: 'farm-1', status: 'PENDING_APPROVAL' });
      expect(result.supplierProfile).toEqual({ id: 'supplier-profile-1' });
    });

    it('does not create a supplier profile or farm when user creation fails', async () => {
      const { service, usersService, suppliersService, farmsService } =
        makeService();
      usersService.createUser.mockRejectedValue(
        new ConflictException('Mobile number already registered'),
      );

      await expect(
        service.registerFarmOwner({
          name: 'Asha',
          mobileNumber: '9876543210',
          password: 'Password123',
          farmName: 'Asha Dairy',
          addressLine1: '123 MG Road',
          area: 'Kothrud',
          city: 'Pune',
          state: 'MH',
          postalCode: '411038',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(suppliersService.createProfile).not.toHaveBeenCalled();
      expect(farmsService.createFarmForOwner).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('logs in with the correct password and issues tokens', async () => {
      const { service, usersService, auditService } = makeService();
      const plainPassword = 'Sup3rSecret!';
      const user = makeUser({
        passwordHash: bcrypt.hashSync(plainPassword, BCRYPT_ROUNDS),
      });
      usersService.findByMobileWithPassword.mockResolvedValue(user);

      const result = await service.login({
        mobileNumber: '9876543210',
        password: plainPassword,
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(usersService.touchLastLogin).toHaveBeenCalledWith(user.id);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN', actorUserId: user.id }),
      );
    });

    it('rejects an incorrect password', async () => {
      const { service, usersService } = makeService();
      const user = makeUser({
        passwordHash: bcrypt.hashSync('correct-password', BCRYPT_ROUNDS),
      });
      usersService.findByMobileWithPassword.mockResolvedValue(user);

      await expect(
        service.login({
          mobileNumber: '9876543210',
          password: 'wrong-password',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown mobile number', async () => {
      const { service, usersService } = makeService();
      usersService.findByMobileWithPassword.mockResolvedValue(null);

      await expect(
        service.login({
          mobileNumber: '0000000000',
          password: 'whatever',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a blocked account', async () => {
      const { service, usersService } = makeService();
      const plainPassword = 'Sup3rSecret!';
      const user = makeUser({
        passwordHash: bcrypt.hashSync(plainPassword, BCRYPT_ROUNDS),
        status: UserStatus.BLOCKED,
      });
      usersService.findByMobileWithPassword.mockResolvedValue(user);

      await expect(
        service.login({
          mobileNumber: '9876543210',
          password: plainPassword,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an inactive account', async () => {
      const { service, usersService } = makeService();
      const plainPassword = 'Sup3rSecret!';
      const user = makeUser({
        passwordHash: bcrypt.hashSync(plainPassword, BCRYPT_ROUNDS),
        status: UserStatus.INACTIVE,
      });
      usersService.findByMobileWithPassword.mockResolvedValue(user);

      await expect(
        service.login({
          mobileNumber: '9876543210',
          password: plainPassword,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('token issuance and refresh', () => {
    it('stores a hashed refresh token, never the plaintext value', async () => {
      const { service, usersService, refreshRepo } = makeService();
      usersService.createUser.mockResolvedValue(makeUser());

      const result = await service.registerCustomer({
        name: 'Asha',
        mobileNumber: '9876543210',
        password: 'Password123',
      });

      expect(refreshRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: expect.any(String) }),
      );
      const savedArg = refreshRepo.save.mock.calls[0][0];
      expect(savedArg.tokenHash).not.toBe(result.refreshToken);
    });

    it('rotates a valid refresh token: revokes the old one and issues a new pair', async () => {
      const { service, refreshRepo } = makeService();
      const stored = {
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'stored-hash',
        deviceId: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: null as Date | null,
        user: makeUser({ id: 'user-1' }),
      };
      refreshRepo.findOne.mockResolvedValue(stored);

      const result = await service.refresh('some-refresh-token');

      expect(stored.revokedAt).not.toBeNull();
      expect(refreshRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rt-1', revokedAt: expect.any(Date) }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('rejects a refresh token that has expired', async () => {
      const { service, refreshRepo } = makeService();
      refreshRepo.findOne.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'stored-hash',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        user: makeUser(),
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a refresh token that was already revoked', async () => {
      const { service, refreshRepo } = makeService();
      refreshRepo.findOne.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'stored-hash',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: new Date(),
        user: makeUser(),
      });

      await expect(service.refresh('revoked-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

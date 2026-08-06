import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FarmMemberRole,
  FarmMemberStatus,
  FarmStatus,
  UserRole,
} from '../../common/enums';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { normalizeMobileNumber } from '../../common/utils/mobile.util';
import { AuditService } from '../audit/audit.service';
import {
  CreateFarmDto,
  FarmDecisionDto,
  ListFarmsDto,
  UpdateFarmDto,
} from './dto/farm.dto';
import { FarmMember } from './entities/farm-member.entity';
import { Farm } from './entities/farm.entity';

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  private autoApprove(): boolean {
    return this.configService.get<boolean>('app.autoApproveFarms') === true;
  }

  async createFarmForOwner(
    user: { id: string; role: UserRole; mobileNumber?: string },
    dto: CreateFarmDto,
    mobileNumber: string,
  ): Promise<Farm> {
    if (user.role !== UserRole.FARM_OWNER) {
      throw new ForbiddenException('Only farm owners can create farms');
    }

    const status = this.autoApprove()
      ? FarmStatus.ACTIVE
      : FarmStatus.PENDING_APPROVAL;

    const farm = await this.farmsRepo.save(
      this.farmsRepo.create({
        name: dto.name,
        businessName: dto.businessName ?? null,
        description: dto.description ?? null,
        mobileNumber: normalizeMobileNumber(mobileNumber),
        email: dto.email ?? null,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2 ?? null,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        status,
        approvedAt: status === FarmStatus.ACTIVE ? new Date() : null,
        createdByUserId: user.id,
      }),
    );

    await this.membersRepo.save(
      this.membersRepo.create({
        farmId: farm.id,
        userId: user.id,
        memberRole: FarmMemberRole.OWNER,
        status: FarmMemberStatus.ACTIVE,
        joinedAt: new Date(),
      }),
    );

    await this.auditService.log({
      actorUserId: user.id,
      farmId: farm.id,
      entityType: 'FARM',
      entityId: farm.id,
      action: 'FARM_CREATED',
      newValues: { name: farm.name, status: farm.status },
    });

    return farm;
  }

  async listMyFarms(userId: string) {
    const memberships = await this.membersRepo.find({
      where: {
        userId,
        status: FarmMemberStatus.ACTIVE,
        memberRole: FarmMemberRole.OWNER,
      },
      relations: ['farm'],
      order: { createdAt: 'DESC' },
    });
    return memberships.map((m) => m.farm).filter(Boolean);
  }

  async getFarm(user: { id: string; role: UserRole }, farmId: string) {
    const farm = await this.farmsRepo.findOne({ where: { id: farmId } });
    if (!farm) throw new NotFoundException('Farm not found');

    if (user.role === UserRole.PLATFORM_OWNER) {
      return farm;
    }

    const membership = await this.membersRepo.findOne({
      where: {
        farmId,
        userId: user.id,
        status: FarmMemberStatus.ACTIVE,
      },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this farm');
    }
    return farm;
  }

  async updateFarm(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: UpdateFarmDto,
  ) {
    await this.assertActiveOwner(user, farmId);
    const farm = await this.farmsRepo.findOneOrFail({ where: { id: farmId } });
    Object.assign(farm, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.businessName !== undefined
        ? { businessName: dto.businessName }
        : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.addressLine1 !== undefined
        ? { addressLine1: dto.addressLine1 }
        : {}),
      ...(dto.addressLine2 !== undefined
        ? { addressLine2: dto.addressLine2 }
        : {}),
      ...(dto.area !== undefined ? { area: dto.area } : {}),
      ...(dto.city !== undefined ? { city: dto.city } : {}),
      ...(dto.state !== undefined ? { state: dto.state } : {}),
      ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode } : {}),
    });
    const saved = await this.farmsRepo.save(farm);
    await this.auditService.log({
      actorUserId: user.id,
      farmId,
      entityType: 'FARM',
      entityId: farmId,
      action: 'FARM_UPDATED',
      newValues: { ...dto },
    });
    return saved;
  }

  async listForAdmin(query: ListFarmsDto) {
    const qb = this.farmsRepo.createQueryBuilder('f');
    if (query.status) {
      qb.andWhere('f.status = :status', { status: query.status });
    }
    if (query.city) {
      qb.andWhere('f.city ILIKE :city', { city: `%${query.city}%` });
    }
    if (query.postalCode) {
      qb.andWhere('f.postal_code = :postalCode', {
        postalCode: query.postalCode,
      });
    }
    if (query.search) {
      qb.andWhere(
        '(f.name ILIKE :search OR f.business_name ILIKE :search OR f.mobile_number ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    qb.orderBy('f.created_at', query.sortOrder || 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async approve(actor: { id: string }, farmId: string, dto: FarmDecisionDto) {
    return this.setStatus(actor, farmId, FarmStatus.ACTIVE, dto.notes, true);
  }

  async reject(actor: { id: string }, farmId: string, dto: FarmDecisionDto) {
    return this.setStatus(actor, farmId, FarmStatus.REJECTED, dto.notes, true);
  }

  async suspend(actor: { id: string }, farmId: string, dto: FarmDecisionDto) {
    return this.setStatus(
      actor,
      farmId,
      FarmStatus.SUSPENDED,
      dto.notes,
      false,
    );
  }

  async reactivate(
    actor: { id: string },
    farmId: string,
    dto: FarmDecisionDto,
  ) {
    return this.setStatus(actor, farmId, FarmStatus.ACTIVE, dto.notes, true);
  }

  async listMembers(user: { id: string; role: UserRole }, farmId: string) {
    if (user.role !== UserRole.PLATFORM_OWNER) {
      await this.assertActiveOwner(user, farmId);
    }
    return this.membersRepo.find({
      where: { farmId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async assertActiveOwner(
    user: { id: string; role: UserRole },
    farmId: string,
  ): Promise<FarmMember> {
    if (user.role === UserRole.PLATFORM_OWNER) {
      const any = await this.membersRepo.findOne({
        where: { farmId, memberRole: FarmMemberRole.OWNER },
      });
      if (!any) throw new NotFoundException('Farm not found');
      return any;
    }
    const membership = await this.membersRepo.findOne({
      where: {
        farmId,
        userId: user.id,
        memberRole: FarmMemberRole.OWNER,
        status: FarmMemberStatus.ACTIVE,
      },
    });
    if (!membership) {
      throw new ForbiddenException('Active farm owner membership required');
    }
    return membership;
  }

  private async setStatus(
    actor: { id: string },
    farmId: string,
    status: FarmStatus,
    notes: string | undefined,
    setApprovalMeta: boolean,
  ) {
    const farm = await this.farmsRepo.findOne({ where: { id: farmId } });
    if (!farm) throw new NotFoundException('Farm not found');

    if (
      status === FarmStatus.ACTIVE &&
      farm.status === FarmStatus.ACTIVE &&
      !notes
    ) {
      // idempotent reactivate
    }

    if (
      status === FarmStatus.REJECTED &&
      farm.status !== FarmStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException('Only pending farms can be rejected');
    }

    const previous = farm.status;
    farm.status = status;
    if (notes !== undefined) {
      farm.approvalNotes = notes;
    }
    if (setApprovalMeta) {
      farm.approvedByUserId = actor.id;
      farm.approvedAt = new Date();
    }
    const saved = await this.farmsRepo.save(farm);
    await this.auditService.log({
      actorUserId: actor.id,
      farmId,
      entityType: 'FARM',
      entityId: farmId,
      action: `FARM_${status}`,
      oldValues: { status: previous },
      newValues: { status, notes: notes ?? null },
    });
    return saved;
  }
}

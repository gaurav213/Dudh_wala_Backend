import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { DataSource, Repository } from 'typeorm';
import {
  ConnectionStatus,
  FarmMemberRole,
  FarmMemberStatus,
  FarmStatus,
  ReviewStatus,
  ServiceRequestStatus,
  UserRole,
} from '../../common/enums';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { normalizeMobileNumber } from '../../common/utils/mobile.util';
import { AuditService } from '../audit/audit.service';
import { FarmCustomerConnection } from '../connections/entities/farm-customer-connection.entity';
import {
  saveFarmMediaImage,
  uploadsRoot,
} from '../payments/utils/cash-proof-upload.util';
import { CustomerServiceRequest } from '../service-requests/entities/customer-service-request.entity';
import {
  CreateFarmDto,
  FarmDecisionDto,
  ListFarmsDto,
  UpdateFarmDto,
} from './dto/farm.dto';
import { CreateFarmReviewDto } from './dto/farm-review.dto';
import { FarmMember } from './entities/farm-member.entity';
import { FarmMedia } from './entities/farm-media.entity';
import { FarmMilkProduct } from './entities/farm-milk-product.entity';
import { FarmReview } from './entities/farm-review.entity';
import { Farm } from './entities/farm.entity';

const MAX_FARM_PHOTOS = 5;

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
    @InjectRepository(FarmMedia)
    private readonly mediaRepo: Repository<FarmMedia>,
    @InjectRepository(FarmReview)
    private readonly farmReviewsRepo: Repository<FarmReview>,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
      ...(dto.spokenLanguages !== undefined
        ? {
            spokenLanguages: (dto.spokenLanguages ?? [])
              .map((c) => c.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 5),
          }
        : {}),
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

  /** Resolves the active OWNER member's user id for a farm (legacy supplier_id bridge). */
  async getFarmOwnerUserId(farmId: string): Promise<string> {
    const owner = await this.membersRepo.findOne({
      where: {
        farmId,
        memberRole: FarmMemberRole.OWNER,
        status: FarmMemberStatus.ACTIVE,
      },
    });
    if (!owner) throw new NotFoundException('Farm owner not found');
    return owner.userId;
  }

  async getActiveFarmOrFail(farmId: string): Promise<Farm> {
    const farm = await this.farmsRepo.findOne({ where: { id: farmId } });
    if (!farm) throw new NotFoundException('Farm not found');
    if (farm.status !== FarmStatus.ACTIVE) {
      throw new BadRequestException('Farm is not currently active');
    }
    return farm;
  }

  async getPublicFarm(farmId: string) {
    const farm = await this.getActiveFarmOrFail(farmId);
    const [products, media, reviewAgg, recentReviews] = await Promise.all([
      this.productsRepo.find({
        where: { farmId: farm.id, isAvailable: true },
        order: { name: 'ASC' },
      }),
      this.mediaRepo.find({
        where: { farmId: farm.id },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      this.farmReviewsRepo
        .createQueryBuilder('r')
        .select('AVG(r.rating)', 'avg')
        .addSelect('COUNT(*)', 'count')
        .where('r.farm_id = :farmId', { farmId: farm.id })
        .andWhere('r.status = :status', { status: ReviewStatus.PUBLISHED })
        .getRawOne<{ avg: string | null; count: string }>(),
      this.farmReviewsRepo.find({
        where: { farmId: farm.id, status: ReviewStatus.PUBLISHED },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const reviewCount = Number(reviewAgg?.count ?? 0);
    const averageRating =
      reviewCount > 0 && reviewAgg?.avg != null
        ? Math.round(Number(reviewAgg.avg) * 10) / 10
        : null;

    return {
      id: farm.id,
      name: farm.name,
      businessName: farm.businessName,
      description: farm.description,
      area: farm.area,
      city: farm.city,
      state: farm.state,
      postalCode: farm.postalCode,
      latitude: farm.latitude,
      longitude: farm.longitude,
      createdAt: farm.createdAt,
      images: media.map((m) => ({
        id: m.id,
        url: m.url,
        sortOrder: m.sortOrder,
      })),
      averageRating,
      reviewCount,
      reviews: recentReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        milkType: p.milkType,
        description: p.description,
        currentRatePerLitre: p.currentRatePerLitre,
        minimumQuantity: p.minimumQuantity,
        maximumQuantity: p.maximumQuantity,
        availableShifts: p.availableShifts,
      })),
    };
  }

  async listMedia(user: { id: string; role: UserRole }, farmId: string) {
    await this.assertActiveOwner(user, farmId);
    return this.mediaRepo.find({
      where: { farmId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async addMedia(
    user: { id: string; role: UserRole },
    farmId: string,
    file: Express.Multer.File,
  ) {
    await this.assertActiveOwner(user, farmId);
    const count = await this.mediaRepo.count({ where: { farmId } });
    if (count >= MAX_FARM_PHOTOS) {
      throw new BadRequestException(
        `You can upload at most ${MAX_FARM_PHOTOS} photos`,
      );
    }
    const url = await saveFarmMediaImage(file);
    return this.mediaRepo.save(
      this.mediaRepo.create({
        farmId,
        url,
        sortOrder: count,
        uploadedByUserId: user.id,
      }),
    );
  }

  async deleteMedia(
    user: { id: string; role: UserRole },
    farmId: string,
    mediaId: string,
  ) {
    await this.assertActiveOwner(user, farmId);
    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, farmId },
    });
    if (!media) throw new NotFoundException('Photo not found');
    await this.mediaRepo.remove(media);
    // Best-effort disk cleanup.
    if (media.url.startsWith('/uploads/')) {
      try {
        await unlink(join(uploadsRoot(), media.url.replace(/^\/uploads\//, '')));
      } catch {
        /* ignore missing file */
      }
    }
    return { deleted: true };
  }

  async createFarmReview(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: CreateFarmReviewDto,
  ) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customers can review farms');
    }
    await this.getActiveFarmOrFail(farmId);
    const connection = await this.dataSource
      .getRepository(FarmCustomerConnection)
      .findOne({
        where: {
          farmId,
          customerUserId: user.id,
          status: ConnectionStatus.ACTIVE,
        },
      });
    if (!connection) {
      throw new BadRequestException(
        'Connect with this farm before leaving a review',
      );
    }

    const existing = await this.farmReviewsRepo.findOne({
      where: { farmId, customerUserId: user.id },
    });
    if (existing) {
      existing.rating = dto.rating;
      existing.comment = dto.comment?.trim() || null;
      existing.status = ReviewStatus.PUBLISHED;
      return this.farmReviewsRepo.save(existing);
    }

    return this.farmReviewsRepo.save(
      this.farmReviewsRepo.create({
        farmId,
        customerUserId: user.id,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
        status: ReviewStatus.PUBLISHED,
      }),
    );
  }

  async deactivate(user: { id: string; role: UserRole }, farmId: string) {
    await this.assertActiveOwner(user, farmId);
    const farm = await this.farmsRepo.findOneOrFail({ where: { id: farmId } });
    if (farm.status === FarmStatus.CLOSED) {
      return farm;
    }
    const previous = farm.status;
    farm.status = FarmStatus.CLOSED;
    farm.deactivatedAt = new Date();
    const saved = await this.farmsRepo.save(farm);
    await this.auditService.log({
      actorUserId: user.id,
      farmId,
      entityType: 'FARM',
      entityId: farmId,
      action: 'FARM_DEACTIVATED',
      oldValues: { status: previous },
      newValues: { status: saved.status },
    });
    return saved;
  }

  async requestDeletion(user: { id: string; role: UserRole }, farmId: string) {
    await this.assertActiveOwner(user, farmId);
    const farm = await this.farmsRepo.findOneOrFail({ where: { id: farmId } });

    const [connectionCount, requestCount] = await Promise.all([
      this.dataSource
        .getRepository(FarmCustomerConnection)
        .count({ where: { farmId, status: ConnectionStatus.ACTIVE } }),
      this.dataSource
        .getRepository(CustomerServiceRequest)
        .count({ where: { farmId, status: ServiceRequestStatus.PENDING } }),
    ]);
    const hasRelatedRecords = connectionCount > 0 || requestCount > 0;

    if (hasRelatedRecords) {
      farm.deletionRequestedAt = new Date();
      const saved = await this.farmsRepo.save(farm);
      await this.auditService.log({
        actorUserId: user.id,
        farmId,
        entityType: 'FARM',
        entityId: farmId,
        action: 'FARM_DELETION_REQUESTED',
        newValues: {
          blocked: true,
          reason: 'Active connections or pending requests exist',
        },
      });
      return {
        farm: saved,
        deleted: false,
        message:
          'Deletion requested but blocked: this farm has active customer connections or pending service requests. Close them first or contact platform support.',
      };
    }

    farm.deletionRequestedAt = new Date();
    farm.status = FarmStatus.CLOSED;
    farm.deactivatedAt = farm.deactivatedAt ?? new Date();
    await this.farmsRepo.softRemove(farm);
    await this.auditService.log({
      actorUserId: user.id,
      farmId,
      entityType: 'FARM',
      entityId: farmId,
      action: 'FARM_DELETED',
    });
    return {
      farm,
      deleted: true,
      message: 'Farm has been closed and removed.',
    };
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

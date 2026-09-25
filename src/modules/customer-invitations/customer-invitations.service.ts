import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { InvitationStatus, UserRole } from '../../common/enums';
import { roundMoney, roundQty } from '../../common/utils/decimal.util';
import { normalizeMobileNumber } from '../../common/utils/mobile.util';
import { assertFound } from '../../common/utils/ownership.util';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { AuditService } from '../audit/audit.service';
import { ConnectionsService } from '../connections/connections.service';
import { FarmMilkProduct } from '../farms/entities/farm-milk-product.entity';
import { Farm } from '../farms/entities/farm.entity';
import { FarmsService } from '../farms/farms.service';
import {
  CreateCustomerInvitationDto,
  ListCustomerInvitationsDto,
} from './dto/customer-invitation.dto';
import { FarmCustomerInvitation } from './entities/farm-customer-invitation.entity';

const DEFAULT_EXPIRY_DAYS = 7;

@Injectable()
export class CustomerInvitationsService {
  constructor(
    @InjectRepository(FarmCustomerInvitation)
    private readonly invitationsRepo: Repository<FarmCustomerInvitation>,
    @InjectRepository(FarmMilkProduct)
    private readonly productsRepo: Repository<FarmMilkProduct>,
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly farmsService: FarmsService,
    private readonly connectionsService: ConnectionsService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: CreateCustomerInvitationDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const product = await this.productsRepo.findOne({
      where: { id: dto.productId, farmId, isAvailable: true },
    });
    if (!product) {
      throw new NotFoundException('Available product not found for this farm');
    }

    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + (dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS),
    );

    return this.invitationsRepo.save(
      this.invitationsRepo.create({
        farmId,
        mobileNumber: normalizeMobileNumber(dto.mobileNumber),
        customerName: dto.customerName ?? null,
        productId: dto.productId,
        quantity: roundQty(dto.quantity),
        deliveryShift: dto.deliveryShift,
        proposedRate: roundMoney(dto.proposedRate),
        preferredStartDate: dto.preferredStartDate,
        deliveryInstructions: dto.deliveryInstructions ?? null,
        status: InvitationStatus.PENDING,
        invitedByUserId: user.id,
        expiresAt,
      }),
    );
  }

  async listForFarm(
    user: { id: string; role: UserRole },
    farmId: string,
    query: ListCustomerInvitationsDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const qb = this.invitationsRepo
      .createQueryBuilder('i')
      .where('i.farm_id = :farmId', { farmId });
    if (query.status) {
      qb.andWhere('i.status = :status', { status: query.status });
    }
    qb.orderBy('i.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async cancel(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const invitation = assertFound(
      await this.invitationsRepo.findOne({ where: { id, farmId } }),
      'Invitation not found',
    );
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        'Only pending invitations can be cancelled',
      );
    }
    invitation.status = InvitationStatus.CANCELLED;
    return this.invitationsRepo.save(invitation);
  }

  async findMy(user: { id: string; mobileNumber: string }) {
    const mobileNumber = normalizeMobileNumber(user.mobileNumber);
    const invitations = await this.invitationsRepo.find({
      where: { mobileNumber },
      order: { createdAt: 'DESC' },
    });

    const farmIds = [...new Set(invitations.map((i) => i.farmId))];
    const productIds = [...new Set(invitations.map((i) => i.productId))];
    const [farms, products] = await Promise.all([
      farmIds.length
        ? this.farmsRepo.find({ where: { id: In(farmIds) } })
        : Promise.resolve([] as Farm[]),
      productIds.length
        ? this.productsRepo.find({ where: { id: In(productIds) } })
        : Promise.resolve([] as FarmMilkProduct[]),
    ]);
    const farmById = new Map(farms.map((f) => [f.id, f]));
    const productById = new Map(products.map((p) => [p.id, p]));

    return Promise.all(
      invitations.map(async (inv) => {
        const current = await this.expireIfStale(inv);
        const farm = farmById.get(current.farmId);
        const product = productById.get(current.productId);
        return {
          ...current,
          farmName: farm?.name ?? null,
          farmArea: farm?.area ?? null,
          farmCity: farm?.city ?? null,
          productName: product?.name ?? null,
          milkType: product?.milkType ?? null,
        };
      }),
    );
  }

  async accept(user: { id: string; mobileNumber: string }, id: string) {
    const mobileNumber = normalizeMobileNumber(user.mobileNumber);
    const invitation = await this.loadOwnPendingInvitation(id, mobileNumber);
    const farmOwnerUserId = await this.farmsService.getFarmOwnerUserId(
      invitation.farmId,
    );

    const result = await this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(FarmMilkProduct, {
        where: { id: invitation.productId },
      });
      if (!product) throw new NotFoundException('Product not found');

      const { connection, subscription } =
        await this.connectionsService.acceptIntoSubscription(manager, {
          farmId: invitation.farmId,
          farmOwnerUserId,
          customerUserId: user.id,
          customerName: invitation.customerName ?? 'Customer',
          mobileNumber,
          milkType: product.milkType,
          quantity: invitation.quantity,
          ratePerLitre: invitation.proposedRate,
          deliveryShift: invitation.deliveryShift,
          startDate: invitation.preferredStartDate,
          farmProductId: product.id,
        });

      invitation.status = InvitationStatus.ACCEPTED;
      const savedInvitation = await manager.save(invitation);
      return { invitation: savedInvitation, connection, subscription };
    });

    await this.auditService.log({
      actorUserId: user.id,
      farmId: invitation.farmId,
      entityType: 'CUSTOMER_INVITATION',
      entityId: id,
      action: 'CUSTOMER_INVITATION_ACCEPTED',
    });

    return result;
  }

  async reject(user: { id: string; mobileNumber: string }, id: string) {
    const mobileNumber = normalizeMobileNumber(user.mobileNumber);
    const invitation = await this.loadOwnPendingInvitation(id, mobileNumber);
    invitation.status = InvitationStatus.REJECTED;
    return this.invitationsRepo.save(invitation);
  }

  private async loadOwnPendingInvitation(id: string, mobileNumber: string) {
    const invitation = assertFound(
      await this.invitationsRepo.findOne({ where: { id } }),
      'Invitation not found',
    );
    if (invitation.mobileNumber !== mobileNumber) {
      throw new ForbiddenException('This invitation is not addressed to you');
    }
    const current = await this.expireIfStale(invitation);
    if (current.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        `Invitation is ${current.status.toLowerCase()} and can no longer be actioned`,
      );
    }
    return current;
  }

  private async expireIfStale(invitation: FarmCustomerInvitation) {
    if (
      invitation.status === InvitationStatus.PENDING &&
      invitation.expiresAt.getTime() < Date.now()
    ) {
      invitation.status = InvitationStatus.EXPIRED;
      return this.invitationsRepo.save(invitation);
    }
    return invitation;
  }
}

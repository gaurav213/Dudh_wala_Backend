import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FarmMemberRole,
  FarmMemberStatus,
  InvitationStatus,
  UserRole,
} from '../../common/enums';
import { assertFound } from '../../common/utils/ownership.util';
import { normalizeMobileNumber } from '../../common/utils/mobile.util';
import { InviteFarmStaffDto } from './dto/farm-staff.dto';
import { FarmMemberInvitation } from './entities/farm-member-invitation.entity';
import { FarmMember } from './entities/farm-member.entity';
import { FarmsService } from './farms.service';

const DEFAULT_EXPIRY_DAYS = 7;

@Injectable()
export class FarmStaffService {
  constructor(
    @InjectRepository(FarmMemberInvitation)
    private readonly invitationsRepo: Repository<FarmMemberInvitation>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    private readonly farmsService: FarmsService,
  ) {}

  async invite(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: InviteFarmStaffDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const mobileNumber = normalizeMobileNumber(dto.mobileNumber);

    const existingPending = await this.invitationsRepo.findOne({
      where: { farmId, mobileNumber, status: InvitationStatus.PENDING },
    });
    if (existingPending) {
      throw new ConflictException(
        'A pending invitation already exists for this mobile number',
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + (dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS),
    );

    return this.invitationsRepo.save(
      this.invitationsRepo.create({
        farmId,
        mobileNumber,
        name: dto.name ?? null,
        role: FarmMemberRole.DELIVERY_STAFF,
        status: InvitationStatus.PENDING,
        invitedByUserId: user.id,
        expiresAt,
      }),
    );
  }

  async listInvitations(user: { id: string; role: UserRole }, farmId: string) {
    await this.farmsService.assertActiveOwner(user, farmId);
    return this.invitationsRepo.find({
      where: { farmId },
      order: { createdAt: 'DESC' },
    });
  }

  async resend(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const invitation = assertFound(
      await this.invitationsRepo.findOne({ where: { id, farmId } }),
      'Invitation not found',
    );
    if (
      ![InvitationStatus.PENDING, InvitationStatus.EXPIRED].includes(
        invitation.status,
      )
    ) {
      throw new BadRequestException(
        'Only pending or expired invitations can be resent',
      );
    }
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRY_DAYS);
    invitation.status = InvitationStatus.PENDING;
    invitation.expiresAt = expiresAt;
    return this.invitationsRepo.save(invitation);
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

  async listMembers(user: { id: string; role: UserRole }, farmId: string) {
    return this.farmsService.listMembers(user, farmId);
  }

  async deactivateMember(
    user: { id: string; role: UserRole },
    farmId: string,
    memberId: string,
    opts?: { force?: boolean },
  ) {
    // Pending-delivery guard is handled by FarmStaffDetailService when wired;
    // keep simple path for force reactivation flows.
    if (opts?.force) {
      return this.setMemberStatus(
        user,
        farmId,
        memberId,
        FarmMemberStatus.INACTIVE,
      );
    }
    return this.setMemberStatus(
      user,
      farmId,
      memberId,
      FarmMemberStatus.INACTIVE,
    );
  }

  async reactivateMember(
    user: { id: string; role: UserRole },
    farmId: string,
    memberId: string,
  ) {
    return this.setMemberStatus(
      user,
      farmId,
      memberId,
      FarmMemberStatus.ACTIVE,
    );
  }

  async removeMember(
    user: { id: string; role: UserRole },
    farmId: string,
    memberId: string,
  ) {
    return this.setMemberStatus(
      user,
      farmId,
      memberId,
      FarmMemberStatus.REMOVED,
    );
  }

  private async setMemberStatus(
    user: { id: string; role: UserRole },
    farmId: string,
    memberId: string,
    status: FarmMemberStatus,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const member = assertFound(
      await this.membersRepo.findOne({ where: { id: memberId, farmId } }),
      'Farm member not found',
    );
    if (member.memberRole === FarmMemberRole.OWNER) {
      throw new BadRequestException('Cannot change status of the farm owner');
    }
    member.status = status;
    return this.membersRepo.save(member);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceAreaStatus, UserRole } from '../../common/enums';
import { assertFound } from '../../common/utils/ownership.util';
import {
  CreateFarmServiceAreaDto,
  UpdateFarmServiceAreaDto,
} from './dto/farm-service-area.dto';
import { FarmServiceArea } from './entities/farm-service-area.entity';
import { FarmsService } from './farms.service';

@Injectable()
export class FarmServiceAreasService {
  constructor(
    @InjectRepository(FarmServiceArea)
    private readonly areasRepo: Repository<FarmServiceArea>,
    private readonly farmsService: FarmsService,
  ) {}

  async create(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: CreateFarmServiceAreaDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    return this.areasRepo.save(
      this.areasRepo.create({
        farmId,
        areaName: dto.areaName,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        serviceRadiusKm: dto.serviceRadiusKm ?? null,
        status: dto.status ?? ServiceAreaStatus.ACTIVE,
      }),
    );
  }

  async findAll(user: { id: string; role: UserRole }, farmId: string) {
    await this.farmsService.getFarm(user, farmId);
    return this.areasRepo.find({
      where: { farmId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    await this.farmsService.getFarm(user, farmId);
    return assertFound(
      await this.areasRepo.findOne({ where: { id, farmId } }),
      'Service area not found',
    );
  }

  async update(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
    dto: UpdateFarmServiceAreaDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const area = assertFound(
      await this.areasRepo.findOne({ where: { id, farmId } }),
      'Service area not found',
    );
    Object.assign(area, {
      ...(dto.areaName !== undefined ? { areaName: dto.areaName } : {}),
      ...(dto.city !== undefined ? { city: dto.city } : {}),
      ...(dto.state !== undefined ? { state: dto.state } : {}),
      ...(dto.postalCode !== undefined
        ? { postalCode: dto.postalCode ?? null }
        : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude ?? null } : {}),
      ...(dto.longitude !== undefined
        ? { longitude: dto.longitude ?? null }
        : {}),
      ...(dto.serviceRadiusKm !== undefined
        ? { serviceRadiusKm: dto.serviceRadiusKm ?? null }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    return this.areasRepo.save(area);
  }

  async remove(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const area = assertFound(
      await this.areasRepo.findOne({ where: { id, farmId } }),
      'Service area not found',
    );
    await this.areasRepo.remove(area);
    return { success: true };
  }

  async activate(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    return this.setStatus(user, farmId, id, ServiceAreaStatus.ACTIVE);
  }

  async deactivate(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
  ) {
    return this.setStatus(user, farmId, id, ServiceAreaStatus.INACTIVE);
  }

  private async setStatus(
    user: { id: string; role: UserRole },
    farmId: string,
    id: string,
    status: ServiceAreaStatus,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const area = assertFound(
      await this.areasRepo.findOne({ where: { id, farmId } }),
      'Service area not found',
    );
    area.status = status;
    return this.areasRepo.save(area);
  }
}

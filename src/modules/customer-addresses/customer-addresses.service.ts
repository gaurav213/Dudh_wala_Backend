import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { assertFound } from '../../common/utils/ownership.util';
import {
  selectAddressIdsToClear,
  shouldDefaultNewAddress,
} from './customer-address.util';
import {
  CreateCustomerAddressDto,
  UpdateCustomerAddressDto,
} from './dto/customer-address.dto';
import { CustomerAddress } from './entities/customer-address.entity';

@Injectable()
export class CustomerAddressesService {
  constructor(
    @InjectRepository(CustomerAddress)
    private readonly addressesRepo: Repository<CustomerAddress>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: string, dto: CreateCustomerAddressDto) {
    const existingCount = await this.addressesRepo.count({
      where: { customerUserId: userId },
    });
    const isDefault = shouldDefaultNewAddress(existingCount, dto.isDefault);

    return this.dataSource.transaction(async (manager) => {
      if (isDefault) {
        await this.clearOtherDefaults(manager, userId, null);
      }
      return manager.save(
        manager.create(CustomerAddress, {
          customerUserId: userId,
          label: dto.label,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2 ?? null,
          area: dto.area,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          deliveryInstructions: dto.deliveryInstructions ?? null,
          isDefault,
        }),
      );
    });
  }

  async findAll(userId: string) {
    return this.addressesRepo.find({
      where: { customerUserId: userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string) {
    const address = assertFound(
      await this.addressesRepo.findOne({ where: { id } }),
      'Address not found',
    );
    this.assertOwnership(userId, address);
    return address;
  }

  async update(userId: string, id: string, dto: UpdateCustomerAddressDto) {
    const address = await this.findOne(userId, id);
    const wantsDefault = dto.isDefault === true;

    return this.dataSource.transaction(async (manager) => {
      if (wantsDefault) {
        await this.clearOtherDefaults(manager, userId, address.id);
      }
      Object.assign(address, {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.addressLine1 !== undefined
          ? { addressLine1: dto.addressLine1 }
          : {}),
        ...(dto.addressLine2 !== undefined
          ? { addressLine2: dto.addressLine2 ?? null }
          : {}),
        ...(dto.area !== undefined ? { area: dto.area } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.state !== undefined ? { state: dto.state } : {}),
        ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode } : {}),
        ...(dto.latitude !== undefined
          ? { latitude: dto.latitude ?? null }
          : {}),
        ...(dto.longitude !== undefined
          ? { longitude: dto.longitude ?? null }
          : {}),
        ...(dto.deliveryInstructions !== undefined
          ? { deliveryInstructions: dto.deliveryInstructions ?? null }
          : {}),
        ...(wantsDefault ? { isDefault: true } : {}),
      });
      return manager.save(address);
    });
  }

  async remove(userId: string, id: string) {
    const address = await this.findOne(userId, id);
    await this.addressesRepo.softRemove(address);
    return { success: true };
  }

  async setDefault(userId: string, id: string) {
    const address = await this.findOne(userId, id);
    return this.dataSource.transaction(async (manager) => {
      await this.clearOtherDefaults(manager, userId, address.id);
      address.isDefault = true;
      return manager.save(address);
    });
  }

  private assertOwnership(userId: string, address: CustomerAddress) {
    if (address.customerUserId !== userId) {
      throw new ForbiddenException('You do not own this address');
    }
  }

  private async clearOtherDefaults(
    manager: DataSource['manager'],
    userId: string,
    newDefaultId: string | null,
  ) {
    const existing = await manager.find(CustomerAddress, {
      where: { customerUserId: userId, isDefault: true },
    });
    const idsToClear = selectAddressIdsToClear(
      existing,
      newDefaultId ?? '__none__',
    );
    if (idsToClear.length > 0) {
      await manager
        .createQueryBuilder()
        .update(CustomerAddress)
        .set({ isDefault: false })
        .whereInIds(idsToClear)
        .execute();
    }
  }
}

import {
  ForbiddenException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  AddressLocationSource,
  DeliveryAssignmentStatus,
  UserRole,
} from '../../common/enums';
import { assertFound } from '../../common/utils/ownership.util';
import { AuditService } from '../audit/audit.service';
import { Customer } from '../customers/entities/customer.entity';
import { DeliveryAssignment } from '../farms/entities/delivery-assignment.entity';
import { MilkSubscription } from '../subscriptions/entities/milk-subscription.entity';
import {
  selectAddressIdsToClear,
  shouldDefaultNewAddress,
} from './customer-address.util';
import {
  CreateCustomerAddressDto,
  UpdateAddressLocationDto,
  UpdateCustomerAddressDto,
} from './dto/customer-address.dto';
import { CustomerAddress } from './entities/customer-address.entity';

@Injectable()
export class CustomerAddressesService {
  constructor(
    @InjectRepository(CustomerAddress)
    private readonly addressesRepo: Repository<CustomerAddress>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(MilkSubscription)
    private readonly subsRepo: Repository<MilkSubscription>,
    @InjectRepository(DeliveryAssignment)
    private readonly assignmentsRepo: Repository<DeliveryAssignment>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async create(userId: string, dto: CreateCustomerAddressDto) {
    const existingCount = await this.addressesRepo.count({
      where: { customerUserId: userId },
    });
    const isDefault = shouldDefaultNewAddress(existingCount, dto.isDefault);
    const hasPin = dto.latitude != null && dto.longitude != null;

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
          locationSource: hasPin
            ? (dto.locationSource ?? AddressLocationSource.CUSTOMER_GPS)
            : null,
          locationAccuracyMeters: dto.locationAccuracyMeters ?? null,
          locationVerified: false,
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
    const oldLat = address.latitude;
    const oldLng = address.longitude;

    const saved = await this.dataSource.transaction(async (manager) => {
      if (wantsDefault) {
        await this.clearOtherDefaults(manager, userId, address.id);
      }
      const pinChanging =
        dto.latitude !== undefined || dto.longitude !== undefined;
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
        ...(dto.locationAccuracyMeters !== undefined
          ? { locationAccuracyMeters: dto.locationAccuracyMeters ?? null }
          : {}),
        ...(dto.deliveryInstructions !== undefined
          ? { deliveryInstructions: dto.deliveryInstructions ?? null }
          : {}),
        ...(wantsDefault ? { isDefault: true } : {}),
      });
      if (pinChanging) {
        address.locationSource =
          dto.locationSource ??
          (address.latitude && address.longitude
            ? AddressLocationSource.CUSTOMER_MAP_PIN
            : null);
        // Customer edits clear staff/farm verification so the new pin is re-checked.
        address.locationVerified = false;
        address.locationVerifiedByUserId = null;
        address.locationVerifiedAt = null;
      }
      return manager.save(address);
    });

    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      await this.auditLocationChange({
        address: saved,
        actorUserId: userId,
        actorRole: UserRole.CUSTOMER,
        oldLat,
        oldLng,
      });
    }
    return saved;
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

  /**
   * Authorized pin update for customer / farm owner / assigned delivery staff.
   * Does not silently overwrite — always audits old → new coordinates.
   */
  async updateLocation(
    user: { id: string; role: UserRole },
    addressId: string,
    dto: UpdateAddressLocationDto,
  ) {
    const address = assertFound(
      await this.addressesRepo.findOne({ where: { id: addressId } }),
      'Address not found',
    );
    await this.assertCanUpdateLocation(user, address);

    const oldLat = address.latitude;
    const oldLng = address.longitude;
    const source =
      dto.locationSource ??
      (user.role === UserRole.DELIVERY_STAFF
        ? AddressLocationSource.DELIVERY_STAFF_MAP_PIN
        : user.role === UserRole.FARM_OWNER
          ? AddressLocationSource.FARM_MAP_PIN
          : AddressLocationSource.CUSTOMER_MAP_PIN);

    address.latitude = dto.latitude;
    address.longitude = dto.longitude;
    address.locationSource = source;
    address.locationAccuracyMeters = dto.locationAccuracyMeters ?? null;

    const shouldVerify =
      dto.markVerified === true ||
      user.role === UserRole.DELIVERY_STAFF ||
      user.role === UserRole.FARM_OWNER;
    if (shouldVerify && user.role !== UserRole.CUSTOMER) {
      address.locationVerified = true;
      address.locationVerifiedByUserId = user.id;
      address.locationVerifiedAt = new Date();
    } else if (user.role === UserRole.CUSTOMER) {
      address.locationVerified = false;
      address.locationVerifiedByUserId = null;
      address.locationVerifiedAt = null;
    }

    const saved = await this.addressesRepo.save(address);
    await this.auditLocationChange({
      address: saved,
      actorUserId: user.id,
      actorRole: user.role,
      oldLat,
      oldLng,
    });
    return saved;
  }

  async confirmLocation(
    user: { id: string; role: UserRole },
    addressId: string,
  ) {
    if (
      user.role !== UserRole.DELIVERY_STAFF &&
      user.role !== UserRole.FARM_OWNER &&
      user.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException(
        'Only staff or farm owner can confirm location',
      );
    }
    const address = assertFound(
      await this.addressesRepo.findOne({ where: { id: addressId } }),
      'Address not found',
    );
    if (!address.latitude || !address.longitude) {
      throw new BadRequestException('Address has no coordinates to confirm');
    }
    await this.assertCanUpdateLocation(user, address);
    address.locationVerified = true;
    address.locationVerifiedByUserId = user.id;
    address.locationVerifiedAt = new Date();
    if (!address.locationSource) {
      address.locationSource =
        user.role === UserRole.DELIVERY_STAFF
          ? AddressLocationSource.DELIVERY_STAFF_MAP_PIN
          : AddressLocationSource.FARM_MAP_PIN;
    }
    return this.addressesRepo.save(address);
  }

  async resetVerification(
    user: { id: string; role: UserRole },
    addressId: string,
  ) {
    if (
      user.role !== UserRole.FARM_OWNER &&
      user.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException('Only farm owner can reset verification');
    }
    const address = assertFound(
      await this.addressesRepo.findOne({ where: { id: addressId } }),
      'Address not found',
    );
    await this.assertCanUpdateLocation(user, address);
    address.locationVerified = false;
    address.locationVerifiedByUserId = null;
    address.locationVerifiedAt = null;
    return this.addressesRepo.save(address);
  }

  private async assertCanUpdateLocation(
    user: { id: string; role: UserRole },
    address: CustomerAddress,
  ) {
    if (user.role === UserRole.PLATFORM_OWNER) return;
    if (user.role === UserRole.CUSTOMER) {
      this.assertOwnership(user.id, address);
      return;
    }

    const ledgerCustomers = await this.customersRepo.find({
      where: { customerUserId: address.customerUserId },
    });
    if (!ledgerCustomers.length) {
      throw new ForbiddenException('Customer not linked to a farm');
    }
    const customerIds = ledgerCustomers.map((c) => c.id);

    if (user.role === UserRole.FARM_OWNER) {
      if (!ledgerCustomers.some((c) => c.supplierId === user.id)) {
        throw new ForbiddenException('Customer not connected to your farm');
      }
      return;
    }

    if (user.role === UserRole.DELIVERY_STAFF) {
      const subs = await this.subsRepo.find({
        where: {
          customerId: In(customerIds),
          assignedDeliveryUserId: user.id,
        },
      });
      if (subs.length) return;

      const assignedSubIds = (
        await this.assignmentsRepo.find({
          where: {
            assigneeUserId: user.id,
            status: DeliveryAssignmentStatus.ACTIVE,
          },
        })
      )
        .map((a) => a.subscriptionId)
        .filter((id): id is string => Boolean(id));

      if (assignedSubIds.length) {
        const viaAssignment = await this.subsRepo.count({
          where: {
            id: In(assignedSubIds),
            customerId: In(customerIds),
          },
        });
        if (viaAssignment > 0) return;
      }

      throw new ForbiddenException('Customer not assigned to you');
    }

    throw new ForbiddenException();
  }

  private async auditLocationChange(input: {
    address: CustomerAddress;
    actorUserId: string;
    actorRole: UserRole;
    oldLat: string | null;
    oldLng: string | null;
  }) {
    await this.auditService.log({
      actorUserId: input.actorUserId,
      entityType: 'CUSTOMER_ADDRESS',
      entityId: input.address.id,
      action: 'ADDRESS_LOCATION_UPDATED',
      oldValues: {
        latitude: input.oldLat,
        longitude: input.oldLng,
      },
      newValues: {
        latitude: input.address.latitude,
        longitude: input.address.longitude,
        locationSource: input.address.locationSource,
        locationVerified: input.address.locationVerified,
        changedByRole: input.actorRole,
      },
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

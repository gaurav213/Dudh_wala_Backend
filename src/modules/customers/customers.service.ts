import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerStatus, UserRole } from '../../common/enums';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { normalizeMobileNumber } from '../../common/utils/mobile.util';
import {
  assertFound,
  assertSupplierOwnership,
  getSupplierIdOrThrow,
} from '../../common/utils/ownership.util';
import { AuditService } from '../audit/audit.service';
import { ChangeLog } from '../sync/entities/change-log.entity';
import { Customer } from './entities/customer.entity';
import {
  CreateCustomerDto,
  ListCustomersDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(ChangeLog)
    private readonly changeLogRepo: Repository<ChangeLog>,
    private readonly auditService: AuditService,
  ) {}

  async create(user: { id: string; role: UserRole }, dto: CreateCustomerDto) {
    const supplierId = getSupplierIdOrThrow(user);
    const mobileNumber = dto.mobileNumber
      ? normalizeMobileNumber(dto.mobileNumber)
      : null;
    if (mobileNumber) {
      const existing = await this.customersRepo.findOne({
        where: { supplierId, mobileNumber },
      });
      if (existing) {
        throw new ConflictException(
          'Customer with this mobile already exists for supplier',
        );
      }
    }
    const customer = await this.customersRepo.save(
      this.customersRepo.create({
        supplierId,
        name: dto.name,
        mobileNumber,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
        status: CustomerStatus.ACTIVE,
        version: 1,
      }),
    );
    await this.writeChange(supplierId, customer.id, 'CREATE', customer.version);
    await this.auditService.log({
      actorUserId: user.id,
      supplierId,
      entityType: 'CUSTOMER',
      entityId: customer.id,
      action: 'CUSTOMER_CREATED',
      newValues: { name: customer.name, mobileNumber: customer.mobileNumber },
    });
    return customer;
  }

  async findAll(user: { id: string; role: UserRole }, query: ListCustomersDto) {
    const supplierId =
      user.role === UserRole.PLATFORM_OWNER
        ? undefined
        : getSupplierIdOrThrow(user);
    const qb = this.customersRepo.createQueryBuilder('c');
    if (supplierId) {
      qb.andWhere('c.supplier_id = :supplierId', { supplierId });
    }
    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere('(c.name ILIKE :search OR c.mobile_number ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    const sortBy = ['name', 'createdAt', 'status'].includes(query.sortBy || '')
      ? query.sortBy!
      : 'createdAt';
    qb.orderBy(`c.${sortBy}`, query.sortOrder || 'DESC');
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async findOne(user: { id: string; role: UserRole }, id: string) {
    const customer = assertFound(
      await this.customersRepo.findOne({ where: { id } }),
      'Customer not found',
    );
    assertSupplierOwnership(user, customer.supplierId, 'customer');
    return customer;
  }

  async update(
    user: { id: string; role: UserRole },
    id: string,
    dto: UpdateCustomerDto,
  ) {
    const customer = await this.findOne(user, id);
    if (dto.mobileNumber !== undefined) {
      customer.mobileNumber = dto.mobileNumber
        ? normalizeMobileNumber(dto.mobileNumber)
        : null;
    }
    if (dto.name !== undefined) customer.name = dto.name;
    if (dto.address !== undefined) customer.address = dto.address ?? null;
    if (dto.notes !== undefined) customer.notes = dto.notes ?? null;
    customer.version += 1;
    const saved = await this.customersRepo.save(customer);
    await this.writeChange(saved.supplierId, saved.id, 'UPDATE', saved.version);
    return saved;
  }

  async remove(user: { id: string; role: UserRole }, id: string) {
    const customer = await this.findOne(user, id);
    customer.status = CustomerStatus.ARCHIVED;
    customer.version += 1;
    const saved = await this.customersRepo.save(customer);
    await this.customersRepo.softRemove(saved);
    await this.writeChange(saved.supplierId, saved.id, 'DELETE', saved.version);
    await this.auditService.log({
      actorUserId: user.id,
      supplierId: saved.supplierId,
      entityType: 'CUSTOMER',
      entityId: saved.id,
      action: 'CUSTOMER_ARCHIVED',
    });
    return { success: true };
  }

  async pause(user: { id: string; role: UserRole }, id: string) {
    const customer = await this.findOne(user, id);
    customer.status = CustomerStatus.PAUSED;
    customer.version += 1;
    const saved = await this.customersRepo.save(customer);
    await this.writeChange(saved.supplierId, saved.id, 'UPDATE', saved.version);
    return saved;
  }

  async reactivate(user: { id: string; role: UserRole }, id: string) {
    const customer = await this.findOne(user, id);
    customer.status = CustomerStatus.ACTIVE;
    customer.version += 1;
    const saved = await this.customersRepo.save(customer);
    await this.writeChange(saved.supplierId, saved.id, 'UPDATE', saved.version);
    return saved;
  }

  private async writeChange(
    supplierId: string,
    entityId: string,
    changeType: string,
    entityVersion: number,
  ) {
    await this.changeLogRepo.save(
      this.changeLogRepo.create({
        supplierId,
        entityType: 'CUSTOMER',
        entityId,
        changeType,
        entityVersion,
      }),
    );
  }
}

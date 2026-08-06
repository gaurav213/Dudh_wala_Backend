import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillStatus, UserRole, UserStatus } from '../../common/enums';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { AuditService } from '../audit/audit.service';
import { MonthlyBill } from '../billing/entities/monthly-bill.entity';
import { Customer } from '../customers/entities/customer.entity';
import { User } from '../users/entities/user.entity';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { SupplierProfile } from './entities/supplier-profile.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(SupplierProfile)
    private readonly profilesRepo: Repository<SupplierProfile>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(MonthlyBill)
    private readonly billsRepo: Repository<MonthlyBill>,
    private readonly auditService: AuditService,
  ) {}

  async createProfile(params: {
    userId: string;
    businessName: string;
    address?: string;
    defaultTimezone?: string;
  }): Promise<SupplierProfile> {
    const profile = this.profilesRepo.create({
      userId: params.userId,
      businessName: params.businessName,
      address: params.address ?? null,
      defaultTimezone: params.defaultTimezone || 'Asia/Kolkata',
    });
    return this.profilesRepo.save(profile);
  }

  async findByUserId(userId: string): Promise<SupplierProfile | null> {
    return this.profilesRepo.findOne({ where: { userId } });
  }

  async findByUserIdOrFail(userId: string): Promise<SupplierProfile> {
    const profile = await this.findByUserId(userId);
    if (!profile) throw new NotFoundException('Supplier profile not found');
    return profile;
  }

  async updateProfile(
    userId: string,
    data: Partial<
      Pick<SupplierProfile, 'businessName' | 'address' | 'defaultTimezone'>
    >,
  ): Promise<SupplierProfile> {
    const profile = await this.findByUserIdOrFail(userId);
    Object.assign(profile, data);
    return this.profilesRepo.save(profile);
  }

  async listForAdmin(query: ListSuppliersDto) {
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.supplierProfile', 'p')
      .where('u.role = :role', { role: UserRole.FARM_OWNER });

    if (query.status) {
      qb.andWhere('u.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere(
        '(u.name ILIKE :search OR u.mobile_number ILIKE :search OR p.business_name ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('u.createdAt', query.sortOrder || 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [users, total] = await qb.getManyAndCount();
    const data = await Promise.all(
      users.map(async (user) => this.toAdminListItem(user)),
    );
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async getAdminDetail(userId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId, role: UserRole.FARM_OWNER },
      relations: ['supplierProfile'],
    });
    if (!user) throw new NotFoundException('Supplier not found');

    const base = await this.toAdminListItem(user);
    const customers = await this.customersRepo.find({
      where: { supplierId: userId },
      order: { name: 'ASC' },
      take: 100,
    });

    const billingRaw = await this.billsRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.total_amount), 0)', 'totalBilled')
      .addSelect('COALESCE(SUM(b.paid_amount), 0)', 'totalCollected')
      .addSelect('COALESCE(SUM(b.remaining_balance), 0)', 'outstanding')
      .addSelect('MAX(b.billing_month)', 'lastBillDate')
      .where('b.supplier_id = :userId', { userId })
      .andWhere('b.status != :voidStatus', { voidStatus: BillStatus.VOID })
      .getRawOne<{
        totalBilled: string;
        totalCollected: string;
        outstanding: string;
        lastBillDate: string | null;
      }>();

    return {
      ...base,
      billing: {
        totalBilled: Number(billingRaw?.totalBilled ?? 0),
        totalCollected: Number(billingRaw?.totalCollected ?? 0),
        outstanding: Number(billingRaw?.outstanding ?? 0),
        lastBillDate: billingRaw?.lastBillDate ?? null,
      },
      customers: customers.map((c) => ({
        id: c.id,
        fullName: c.name,
        status: c.status,
      })),
    };
  }

  async setSupplierStatus(
    userId: string,
    status: 'ACTIVE' | 'BLOCKED',
    actorUserId?: string,
  ) {
    const user = await this.usersRepo.findOne({
      where: { id: userId, role: UserRole.FARM_OWNER },
      relations: ['supplierProfile'],
    });
    if (!user) throw new NotFoundException('Supplier not found');

    const previous = user.status;
    user.status = status === 'ACTIVE' ? UserStatus.ACTIVE : UserStatus.BLOCKED;
    await this.usersRepo.save(user);

    await this.auditService.log({
      actorUserId: actorUserId ?? null,
      supplierId: user.id,
      entityType: 'USER',
      entityId: user.id,
      action: status === 'ACTIVE' ? 'SUPPLIER_ACTIVATED' : 'SUPPLIER_BLOCKED',
      oldValues: { status: previous },
      newValues: { status: user.status },
    });

    return this.toAdminListItem(user);
  }

  private async toAdminListItem(user: User) {
    const customerCount = await this.customersRepo.count({
      where: { supplierId: user.id },
    });
    return {
      id: user.id,
      fullName: user.supplierProfile?.businessName || user.name,
      email: null as string | null,
      phone: user.mobileNumber,
      status: user.status,
      customerCount,
      createdAt: user.createdAt,
      address: user.supplierProfile?.address ?? null,
      businessName: user.supplierProfile?.businessName ?? null,
      name: user.name,
      mobileNumber: user.mobileNumber,
    };
  }
}

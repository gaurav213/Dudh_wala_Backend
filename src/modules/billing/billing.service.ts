import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Between, DataSource, Repository } from 'typeorm';
import {
  BillItemType,
  BillStatus,
  DeliveryStatus,
  UserRole,
} from '../../common/enums';
import {
  addMoney,
  calculateBillTotals,
  roundMoney,
} from '../../common/utils/decimal.util';
import { buildPageMeta } from '../../common/utils/pagination.util';
import {
  assertFound,
  assertSupplierOwnership,
  getSupplierIdOrThrow,
} from '../../common/utils/ownership.util';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import {
  GenerateBillDto,
  ListBillsDto,
  UpdateBillDto,
} from './dto/billing.dto';
import { MonthlyBillItem } from './entities/monthly-bill-item.entity';
import { MonthlyBill } from './entities/monthly-bill.entity';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(MonthlyBill)
    private readonly billsRepo: Repository<MonthlyBill>,
    @InjectRepository(MonthlyBillItem)
    private readonly itemsRepo: Repository<MonthlyBillItem>,
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly customersService: CustomersService,
    private readonly auditService: AuditService,
  ) {}

  normalizeBillingMonth(input: string): string {
    if (/^\d{4}-\d{2}$/.test(input)) return `${input}-01`;
    if (/^\d{4}-\d{2}-01$/.test(input)) return input;
    throw new BadRequestException('billingMonth must be YYYY-MM or YYYY-MM-01');
  }

  async generate(user: { id: string; role: UserRole }, dto: GenerateBillDto) {
    const customer = await this.customersService.findOne(user, dto.customerId);
    const billingMonth = this.normalizeBillingMonth(dto.billingMonth);
    const existing = await this.billsRepo.findOne({
      where: { customerId: customer.id, billingMonth },
    });
    if (existing) {
      throw new ConflictException(
        'Bill already exists for this customer/month',
      );
    }

    const monthStart = billingMonth;
    const monthEnd = this.endOfMonth(billingMonth);

    return this.dataSource.transaction(async (manager) => {
      const deliveries = await manager.find(MilkDelivery, {
        where: {
          customerId: customer.id,
          deliveryDate: Between(monthStart, monthEnd),
          status: DeliveryStatus.DELIVERED,
        },
        order: { deliveryDate: 'ASC' },
      });

      const milkAmount = deliveries.reduce(
        (acc, d) => addMoney(acc, d.amount),
        '0.00',
      );
      const totalQuantity = deliveries
        .reduce((acc, d) => acc.plus(new Decimal(d.quantity)), new Decimal(0))
        .toFixed(3);
      const uniqueDays = new Set(deliveries.map((d) => d.deliveryDate)).size;

      const previousBalance = await this.computePreviousBalance(
        customer.id,
        billingMonth,
        manager.getRepository(MonthlyBill),
      );

      const totals = calculateBillTotals({
        milkAmount,
        previousBalance,
        adjustment: dto.adjustment ?? '0.00',
        discount: dto.discount ?? '0.00',
        paidAmount: '0.00',
      });

      const bill = await manager.save(
        manager.create(MonthlyBill, {
          supplierId: customer.supplierId,
          customerId: customer.id,
          billingMonth,
          totalDeliveryDays: uniqueDays,
          totalQuantity,
          milkAmount: totals.milkAmount,
          previousBalance: totals.previousBalance,
          discount: totals.discount,
          adjustment: totals.adjustment,
          totalAmount: totals.totalAmount,
          paidAmount: totals.paidAmount,
          remainingBalance: totals.remainingBalance,
          status: BillStatus.DRAFT,
          generatedAt: new Date(),
        }),
      );

      const items: MonthlyBillItem[] = [];
      for (const d of deliveries) {
        items.push(
          manager.create(MonthlyBillItem, {
            billId: bill.id,
            deliveryId: d.id,
            itemDate: d.deliveryDate,
            description: `Milk delivery (${d.deliveryShift})`,
            quantity: d.quantity,
            rate: d.ratePerLitre,
            amount: d.amount,
            itemType: BillItemType.MILK_DELIVERY,
          }),
        );
      }
      if (new Decimal(totals.previousBalance).abs().gt(0)) {
        items.push(
          manager.create(MonthlyBillItem, {
            billId: bill.id,
            deliveryId: null,
            itemDate: billingMonth,
            description: 'Previous balance',
            quantity: '0',
            rate: '0.00',
            amount: totals.previousBalance,
            itemType: BillItemType.PREVIOUS_BALANCE,
          }),
        );
      }
      if (new Decimal(totals.discount).abs().gt(0)) {
        items.push(
          manager.create(MonthlyBillItem, {
            billId: bill.id,
            deliveryId: null,
            itemDate: billingMonth,
            description: 'Discount',
            quantity: '0',
            rate: '0.00',
            amount: `-${totals.discount}`,
            itemType: BillItemType.DISCOUNT,
          }),
        );
      }
      if (new Decimal(totals.adjustment).abs().gt(0)) {
        items.push(
          manager.create(MonthlyBillItem, {
            billId: bill.id,
            deliveryId: null,
            itemDate: billingMonth,
            description: 'Adjustment',
            quantity: '0',
            rate: '0.00',
            amount: totals.adjustment,
            itemType: BillItemType.ADJUSTMENT,
          }),
        );
      }
      await manager.save(items);
      await this.auditService.log({
        actorUserId: user.id,
        supplierId: customer.supplierId,
        entityType: 'BILL',
        entityId: bill.id,
        action: 'BILL_GENERATED',
        newValues: {
          billingMonth,
          totalAmount: bill.totalAmount,
        },
      });
      return { ...bill, items };
    });
  }

  async findAll(user: { id: string; role: UserRole }, query: ListBillsDto) {
    const supplierId =
      user.role === UserRole.PLATFORM_OWNER
        ? undefined
        : getSupplierIdOrThrow(user);
    const qb = this.billsRepo.createQueryBuilder('b');
    if (supplierId) qb.andWhere('b.supplier_id = :supplierId', { supplierId });
    if (query.customerId)
      qb.andWhere('b.customer_id = :customerId', {
        customerId: query.customerId,
      });
    if (query.status)
      qb.andWhere('b.status = :status', { status: query.status });
    if (query.billingMonth) {
      qb.andWhere('b.billing_month = :billingMonth', {
        billingMonth: this.normalizeBillingMonth(query.billingMonth),
      });
    }
    qb.orderBy('b.billing_month', query.sortOrder || 'DESC');
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }

  async findOne(user: { id: string; role: UserRole }, id: string) {
    const bill = assertFound(
      await this.billsRepo.findOne({
        where: { id },
        relations: ['items'],
      }),
      'Bill not found',
    );
    assertSupplierOwnership(user, bill.supplierId, 'bill');
    return bill;
  }

  async findByCustomer(
    user: { id: string; role: UserRole },
    customerId: string,
  ) {
    await this.customersService.findOne(user, customerId);
    return this.billsRepo.find({
      where: { customerId },
      order: { billingMonth: 'DESC' },
    });
  }

  async findByCustomerMonth(
    user: { id: string; role: UserRole },
    customerId: string,
    month: string,
  ) {
    await this.customersService.findOne(user, customerId);
    const billingMonth = this.normalizeBillingMonth(month);
    return assertFound(
      await this.billsRepo.findOne({
        where: { customerId, billingMonth },
        relations: ['items'],
      }),
      'Bill not found',
    );
  }

  async update(
    user: { id: string; role: UserRole },
    id: string,
    dto: UpdateBillDto,
  ) {
    const bill = await this.findOne(user, id);
    if (bill.status !== BillStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT bills can be updated');
    }
    const totals = calculateBillTotals({
      milkAmount: bill.milkAmount,
      previousBalance: bill.previousBalance,
      adjustment: dto.adjustment ?? bill.adjustment,
      discount: dto.discount ?? bill.discount,
      paidAmount: bill.paidAmount,
    });
    Object.assign(bill, {
      discount: totals.discount,
      adjustment: totals.adjustment,
      totalAmount: totals.totalAmount,
      remainingBalance: totals.remainingBalance,
    });
    return this.billsRepo.save(bill);
  }

  async finalize(user: { id: string; role: UserRole }, id: string) {
    const bill = await this.findOne(user, id);
    if (bill.status !== BillStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT bills can be finalized');
    }
    bill.status = BillStatus.ISSUED;
    bill.finalizedAt = new Date();
    const saved = await this.billsRepo.save(bill);
    await this.auditService.log({
      actorUserId: user.id,
      supplierId: bill.supplierId,
      entityType: 'BILL',
      entityId: bill.id,
      action: 'BILL_FINALIZED',
    });
    return saved;
  }

  async void(user: { id: string; role: UserRole }, id: string) {
    const bill = await this.findOne(user, id);
    if (bill.status === BillStatus.VOID) {
      throw new BadRequestException('Bill already void');
    }
    bill.status = BillStatus.VOID;
    const saved = await this.billsRepo.save(bill);
    await this.auditService.log({
      actorUserId: user.id,
      supplierId: bill.supplierId,
      entityType: 'BILL',
      entityId: bill.id,
      action: 'BILL_VOIDED',
    });
    return saved;
  }

  async pdfData(user: { id: string; role: UserRole }, id: string) {
    const bill = await this.findOne(user, id);
    const customer = await this.customersService.findOne(user, bill.customerId);
    return {
      bill,
      customer,
      supplierId: bill.supplierId,
      generatedForPdf: true,
    };
  }

  async recalculateBillPaidAmount(
    billId: string,
    paidAmount: string,
    manager?: DataSource['manager'],
  ) {
    const repo = manager ? manager.getRepository(MonthlyBill) : this.billsRepo;
    const bill = assertFound(await repo.findOne({ where: { id: billId } }));
    const remaining = roundMoney(
      new Decimal(bill.totalAmount).minus(new Decimal(paidAmount)),
    );
    bill.paidAmount = roundMoney(paidAmount);
    bill.remainingBalance = remaining;
    if (bill.status !== BillStatus.DRAFT && bill.status !== BillStatus.VOID) {
      if (new Decimal(remaining).lte(0)) bill.status = BillStatus.PAID;
      else if (new Decimal(paidAmount).gt(0))
        bill.status = BillStatus.PARTIALLY_PAID;
      else bill.status = BillStatus.ISSUED;
    }
    return repo.save(bill);
  }

  private async computePreviousBalance(
    customerId: string,
    billingMonth: string,
    repo: Repository<MonthlyBill>,
  ): Promise<string> {
    const previous = await repo
      .createQueryBuilder('b')
      .where('b.customer_id = :customerId', { customerId })
      .andWhere('b.billing_month < :billingMonth', { billingMonth })
      .andWhere('b.status != :void', { void: BillStatus.VOID })
      .orderBy('b.billing_month', 'DESC')
      .getOne();
    return previous ? roundMoney(previous.remainingBalance) : '0.00';
  }

  private endOfMonth(billingMonth: string): string {
    const [y, m] = billingMonth.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0));
    const dd = String(last.getUTCDate()).padStart(2, '0');
    return `${y}-${String(m).padStart(2, '0')}-${dd}`;
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { UserRole } from '../../common/enums';
import { todayIso } from '../../common/utils/date.util';
import { dairyMonthSummary, slipAmount } from './dairy-sales.util';
import { CreateDairyPaymentDto, CreateDairySlipDto } from './dto/dairy-sales.dto';
import { DairyPayment } from './entities/dairy-payment.entity';
import { DairySlip } from './entities/dairy-slip.entity';
import { FarmsService } from './farms.service';

function asDay(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}
function monthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new BadRequestException('month must be YYYY-MM');
  }
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const mm = String(mon).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

@Injectable()
export class DairySalesService {
  constructor(
    private readonly farmsService: FarmsService,
    @InjectRepository(DairySlip)
    private readonly slips: Repository<DairySlip>,
    @InjectRepository(DairyPayment)
    private readonly payments: Repository<DairyPayment>,
  ) {}

  async createSlip(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: CreateDairySlipDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const row = this.slips.create({
      farmId,
      dairyName: dto.dairyName.trim(),
      slipDate: dto.slipDate,
      litres: dto.litres,
      rate: dto.rate,
      amount: dto.amount?.trim() || slipAmount(dto.litres, dto.rate),
      fatPercent: dto.fatPercent?.trim() || null,
      rawNumbers: dto.rawNumbers?.length ? dto.rawNumbers : null,
    });
    return this.slips.save(row);
  }

  async createPayment(
    user: { id: string; role: UserRole },
    farmId: string,
    dto: CreateDairyPaymentDto,
  ) {
    await this.farmsService.assertActiveOwner(user, farmId);
    const row = this.payments.create({
      farmId,
      dairyName: dto.dairyName.trim(),
      amount: dto.amount,
      paidOn: dto.paidOn,
      note: dto.note?.trim() || null,
    });
    return this.payments.save(row);
  }

  async listSlips(
    user: { id: string; role: UserRole },
    farmId: string,
    month: string,
  ) {
    await this.farmsService.getFarm(user, farmId);
    const { start, end } = monthBounds(month);
    return this.slips.find({
      where: { farmId, slipDate: Between(start, end) },
      order: { slipDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async listPayments(
    user: { id: string; role: UserRole },
    farmId: string,
    month: string,
  ) {
    await this.farmsService.getFarm(user, farmId);
    const { start, end } = monthBounds(month);
    return this.payments.find({
      where: { farmId, paidOn: Between(start, end) },
      order: { paidOn: 'DESC', createdAt: 'DESC' },
    });
  }

  async summary(
    user: { id: string; role: UserRole },
    farmId: string,
    month: string,
  ) {
    await this.farmsService.getFarm(user, farmId);
    const { start, end } = monthBounds(month);
    const [slips, payments] = await Promise.all([
      this.slips.find({ where: { farmId, slipDate: Between(start, end) } }),
      this.payments.find({ where: { farmId, paidOn: Between(start, end) } }),
    ]);
    return {
      month,
      ...dairyMonthSummary({
        today: todayIso(),
        month,
        slips: slips.map((s) => ({
          dairyName: s.dairyName,
          slipDate: asDay(s.slipDate),
          amount: s.amount,
        })),
        payments: payments.map((p) => ({
          dairyName: p.dairyName,
          paidOn: asDay(p.paidOn),
          amount: p.amount,
        })),
      }),
    };
  }
}

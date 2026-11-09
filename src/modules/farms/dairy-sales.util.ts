/** Money for dairy slips. Amounts are rupees with 2 decimals, stored as paise. */

export function toPaise(value: string | number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromPaise(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function slipAmount(litres: string | number, rate: string | number): string {
  const l = typeof litres === 'number' ? litres : Number(litres);
  const r = typeof rate === 'number' ? rate : Number(rate);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return '0.00';
  return (Math.round(l * r * 100) / 100).toFixed(2);
}

export interface DairySlipRow {
  dairyName: string;
  slipDate: string;
  amount: string | number;
}

export interface DairyPaymentRow {
  dairyName: string;
  paidOn: string;
  amount: string | number;
}

export interface DairyNameTotals {
  dairyName: string;
  sold: string;
  received: string;
  due: string;
}

export function dairyMonthSummary(input: {
  today: string;
  month: string;
  slips: DairySlipRow[];
  payments: DairyPaymentRow[];
}): {
  todaySold: string;
  monthSold: string;
  monthReceived: string;
  monthDue: string;
  dairies: DairyNameTotals[];
} {
  const inMonth = (iso: string) => iso.startsWith(input.month);
  const byName = new Map<string, { sold: number; received: number }>();
  const bucket = (name: string) => {
    const key = name.trim();
    let row = byName.get(key);
    if (!row) {
      row = { sold: 0, received: 0 };
      byName.set(key, row);
    }
    return row;
  };

  let todaySold = 0;
  let monthSold = 0;
  let monthReceived = 0;
  for (const slip of input.slips) {
    if (!inMonth(slip.slipDate)) continue;
    const amount = toPaise(slip.amount);
    monthSold += amount;
    if (slip.slipDate === input.today) todaySold += amount;
    bucket(slip.dairyName).sold += amount;
  }
  for (const payment of input.payments) {
    if (!inMonth(payment.paidOn)) continue;
    const amount = toPaise(payment.amount);
    monthReceived += amount;
    bucket(payment.dairyName).received += amount;
  }

  const dairies = [...byName.entries()]
    .map(([dairyName, row]) => ({
      dairyName,
      sold: fromPaise(row.sold),
      received: fromPaise(row.received),
      due: fromPaise(row.sold - row.received),
    }))
    .sort((a, b) => a.dairyName.localeCompare(b.dairyName));

  return {
    todaySold: fromPaise(todaySold),
    monthSold: fromPaise(monthSold),
    monthReceived: fromPaise(monthReceived),
    monthDue: fromPaise(monthSold - monthReceived),
    dairies,
  };
}

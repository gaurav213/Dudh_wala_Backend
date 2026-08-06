import { Decimal } from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function toDecimal(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

export function roundMoney(value: string | number | Decimal): string {
  return new Decimal(value).toFixed(2);
}

export function roundQty(value: string | number | Decimal, places = 3): string {
  return new Decimal(value).toFixed(places);
}

export function calculateAmount(
  quantity: string | number,
  ratePerLitre: string | number,
): string {
  return roundMoney(new Decimal(quantity).mul(new Decimal(ratePerLitre)));
}

export function addMoney(...values: Array<string | number>): string {
  return roundMoney(
    values.reduce<Decimal>(
      (acc, v) => acc.plus(new Decimal(v)),
      new Decimal(0),
    ),
  );
}

export function subMoney(a: string | number, b: string | number): string {
  return roundMoney(new Decimal(a).minus(new Decimal(b)));
}

export interface BillCalculationInput {
  milkAmount: string | number;
  previousBalance: string | number;
  adjustment?: string | number;
  discount?: string | number;
  paidAmount?: string | number;
}

export interface BillCalculationResult {
  milkAmount: string;
  previousBalance: string;
  adjustment: string;
  discount: string;
  subtotal: string;
  totalAmount: string;
  paidAmount: string;
  remainingBalance: string;
}

export function calculateBillTotals(
  input: BillCalculationInput,
): BillCalculationResult {
  const milkAmount = roundMoney(input.milkAmount);
  const previousBalance = roundMoney(input.previousBalance);
  const adjustment = roundMoney(input.adjustment ?? 0);
  const discount = roundMoney(input.discount ?? 0);
  const paidAmount = roundMoney(input.paidAmount ?? 0);
  const subtotal = addMoney(milkAmount, previousBalance, adjustment);
  const totalAmount = subMoney(subtotal, discount);
  const remainingBalance = subMoney(totalAmount, paidAmount);
  return {
    milkAmount,
    previousBalance,
    adjustment,
    discount,
    subtotal,
    totalAmount,
    paidAmount,
    remainingBalance,
  };
}

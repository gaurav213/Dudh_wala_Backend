import { SubscriptionStatus } from '../enums';

export interface SubscriptionDateRange {
  id?: string;
  customerId: string;
  milkType: string;
  deliveryShift: string;
  status: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
}

function toTime(date: string): number {
  return new Date(date + 'T00:00:00Z').getTime();
}

function rangesOverlap(
  aStart: string,
  aEnd: string | null | undefined,
  bStart: string,
  bEnd: string | null | undefined,
): boolean {
  const as = toTime(aStart);
  const ae = aEnd ? toTime(aEnd) : Number.POSITIVE_INFINITY;
  const bs = toTime(bStart);
  const be = bEnd ? toTime(bEnd) : Number.POSITIVE_INFINITY;
  return as <= be && bs <= ae;
}

/**
 * Returns true if an ACTIVE subscription overlaps another ACTIVE one
 * for the same customer + milkType + deliveryShift.
 */
export function hasActiveSubscriptionOverlap(
  candidate: SubscriptionDateRange,
  existing: SubscriptionDateRange[],
): boolean {
  if (candidate.status !== SubscriptionStatus.ACTIVE) {
    return false;
  }
  return existing.some((sub) => {
    if (sub.status !== SubscriptionStatus.ACTIVE) return false;
    if (candidate.id && sub.id === candidate.id) return false;
    if (sub.customerId !== candidate.customerId) return false;
    if (sub.milkType !== candidate.milkType) return false;
    if (sub.deliveryShift !== candidate.deliveryShift) return false;
    return rangesOverlap(
      candidate.startDate,
      candidate.endDate,
      sub.startDate,
      sub.endDate,
    );
  });
}

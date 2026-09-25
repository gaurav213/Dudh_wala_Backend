import {
  SubscriptionScheduleType,
  SubscriptionStatus,
  Weekday,
} from '../enums';

export interface SubscriptionScheduleLike {
  status: SubscriptionStatus;
  startDate: string;
  endDate?: string | null;
  scheduleType?: SubscriptionScheduleType | null;
  deliveryDays?: number[] | null;
  pausedFrom?: string | null;
  pausedUntil?: string | null;
  holidayDates?: string[] | null;
}

/** Parse YYYY-MM-DD as a UTC calendar date. */
export function parseIsoDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** JS getUTCDay: 0=Sun … 6=Sat → Weekday 1=Mon … 7=Sun */
export function weekdayFromIsoDate(date: string): Weekday {
  const day = parseIsoDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isDateInRange(
  date: string,
  start: string,
  end?: string | null,
): boolean {
  if (date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function isPausedOnDate(
  date: string,
  pausedFrom?: string | null,
  pausedUntil?: string | null,
): boolean {
  if (!pausedFrom) return false;
  if (date < pausedFrom) return false;
  if (pausedUntil && date > pausedUntil) return false;
  return true;
}

export function isHoliday(
  date: string,
  holidayDates?: string[] | null,
): boolean {
  if (!holidayDates?.length) return false;
  return holidayDates.includes(date);
}

export function matchesScheduleDays(
  date: string,
  scheduleType: SubscriptionScheduleType = SubscriptionScheduleType.EVERY_DAY,
  deliveryDays?: number[] | null,
  startDate?: string | null,
): boolean {
  const weekday = weekdayFromIsoDate(date);
  switch (scheduleType) {
    case SubscriptionScheduleType.EVERY_DAY:
      return true;
    case SubscriptionScheduleType.WEEKDAYS:
      return weekday >= Weekday.MONDAY && weekday <= Weekday.FRIDAY;
    case SubscriptionScheduleType.ALTERNATE_DAYS: {
      if (!startDate) return true;
      const startMs = parseIsoDate(startDate).getTime();
      const curMs = parseIsoDate(date).getTime();
      const dayDiff = Math.round((curMs - startMs) / 86_400_000);
      return dayDiff >= 0 && dayDiff % 2 === 0;
    }
    case SubscriptionScheduleType.WEEKLY:
    case SubscriptionScheduleType.CUSTOM: {
      const days = deliveryDays ?? [];
      return days.includes(weekday);
    }
    default:
      return true;
  }
}

/** Next delivery dates from startDate (inclusive), using schedule rules. */
export function nextDeliveryDates(params: {
  startDate: string;
  scheduleType?: SubscriptionScheduleType | null;
  deliveryDays?: number[] | null;
  count?: number;
  fromDate?: string;
}): string[] {
  const scheduleType =
    params.scheduleType ?? SubscriptionScheduleType.EVERY_DAY;
  const count = params.count ?? 2;
  const from = params.fromDate ?? params.startDate;
  const out: string[] = [];
  let cursor = parseIsoDate(from < params.startDate ? params.startDate : from);
  // Scan up to ~2 years of calendar days.
  for (let i = 0; i < 800 && out.length < count; i++) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cursor.getUTCDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    if (
      iso >= params.startDate &&
      matchesScheduleDays(
        iso,
        scheduleType,
        params.deliveryDays,
        params.startDate,
      )
    ) {
      out.push(iso);
    }
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return out;
}

/**
 * Single source of truth: should a subscription produce a delivery on `date`?
 */
export function isDeliveryRequiredOnDate(
  sub: SubscriptionScheduleLike,
  date: string,
): boolean {
  if (sub.status !== SubscriptionStatus.ACTIVE) return false;
  if (!isDateInRange(date, sub.startDate, sub.endDate)) return false;
  if (isPausedOnDate(date, sub.pausedFrom, sub.pausedUntil)) return false;
  if (isHoliday(date, sub.holidayDates)) return false;
  return matchesScheduleDays(
    date,
    sub.scheduleType ?? SubscriptionScheduleType.EVERY_DAY,
    sub.deliveryDays,
    sub.startDate,
  );
}

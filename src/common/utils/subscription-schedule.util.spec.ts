import { SubscriptionScheduleType, SubscriptionStatus } from '../enums';
import {
  isDeliveryRequiredOnDate,
  nextDeliveryDates,
  weekdayFromIsoDate,
} from './subscription-schedule.util';

describe('subscription-schedule.util', () => {
  const base = {
    status: SubscriptionStatus.ACTIVE,
    startDate: '2026-08-01',
    endDate: null as string | null,
    scheduleType: SubscriptionScheduleType.EVERY_DAY,
    deliveryDays: null as number[] | null,
    pausedFrom: null as string | null,
    pausedUntil: null as string | null,
    holidayDates: null as string[] | null,
  };

  it('maps weekdays correctly (2026-08-07 is Friday)', () => {
    expect(weekdayFromIsoDate('2026-08-07')).toBe(5);
  });

  it('requires delivery every day by default', () => {
    expect(isDeliveryRequiredOnDate(base, '2026-08-07')).toBe(true);
  });

  it('respects WEEKDAYS schedule', () => {
    const sub = { ...base, scheduleType: SubscriptionScheduleType.WEEKDAYS };
    expect(isDeliveryRequiredOnDate(sub, '2026-08-07')).toBe(true); // Fri
    expect(isDeliveryRequiredOnDate(sub, '2026-08-08')).toBe(false); // Sat
  });

  it('respects CUSTOM days', () => {
    const sub = {
      ...base,
      scheduleType: SubscriptionScheduleType.CUSTOM,
      deliveryDays: [1, 3, 5], // Mon Wed Fri
    };
    expect(isDeliveryRequiredOnDate(sub, '2026-08-07')).toBe(true);
    expect(isDeliveryRequiredOnDate(sub, '2026-08-06')).toBe(false); // Thu
  });

  it('respects ALTERNATE_DAYS from startDate', () => {
    const sub = {
      ...base,
      startDate: '2026-08-01',
      scheduleType: SubscriptionScheduleType.ALTERNATE_DAYS,
    };
    expect(isDeliveryRequiredOnDate(sub, '2026-08-01')).toBe(true);
    expect(isDeliveryRequiredOnDate(sub, '2026-08-02')).toBe(false);
    expect(isDeliveryRequiredOnDate(sub, '2026-08-03')).toBe(true);
  });

  it('respects WEEKLY deliveryDays', () => {
    const sub = {
      ...base,
      scheduleType: SubscriptionScheduleType.WEEKLY,
      deliveryDays: [5], // Friday
    };
    expect(isDeliveryRequiredOnDate(sub, '2026-08-07')).toBe(true);
    expect(isDeliveryRequiredOnDate(sub, '2026-08-08')).toBe(false);
  });

  it('skips paused window and holidays', () => {
    expect(
      isDeliveryRequiredOnDate(
        { ...base, pausedFrom: '2026-08-06', pausedUntil: '2026-08-08' },
        '2026-08-07',
      ),
    ).toBe(false);
    expect(
      isDeliveryRequiredOnDate(
        { ...base, holidayDates: ['2026-08-07'] },
        '2026-08-07',
      ),
    ).toBe(false);
  });

  it('requires ACTIVE status and date range', () => {
    expect(
      isDeliveryRequiredOnDate(
        { ...base, status: SubscriptionStatus.PAUSED },
        '2026-08-07',
      ),
    ).toBe(false);
    expect(isDeliveryRequiredOnDate(base, '2026-07-31')).toBe(false);
  });

  it('nextDeliveryDates returns alternate-day sequence from start', () => {
    const dates = nextDeliveryDates({
      startDate: '2026-09-07',
      scheduleType: SubscriptionScheduleType.ALTERNATE_DAYS,
      count: 2,
      fromDate: '2026-09-07',
    });
    expect(dates).toEqual(['2026-09-07', '2026-09-09']);
  });
});

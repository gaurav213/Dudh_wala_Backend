import {
  addDaysIso,
  startOfMonthIso,
  startOfWeekIso,
} from './farm-money-dates.util';

describe('farm-money-dates', () => {
  it('computes Monday week start and month start', () => {
    // 2026-09-05 is Saturday → week starts 2026-08-31
    expect(startOfWeekIso('2026-09-05')).toBe('2026-08-31');
    // 2026-09-07 is Monday
    expect(startOfWeekIso('2026-09-07')).toBe('2026-09-07');
    // Sunday → previous Monday
    expect(startOfWeekIso('2026-09-06')).toBe('2026-08-31');
    expect(startOfMonthIso('2026-09-05')).toBe('2026-09-01');
    expect(addDaysIso('2026-09-01', -1)).toBe('2026-08-31');
  });
});

import { SubscriptionStatus } from '../enums';
import { hasActiveSubscriptionOverlap } from './subscription-overlap.util';

describe('hasActiveSubscriptionOverlap', () => {
  const base = {
    customerId: 'c1',
    milkType: 'COW',
    deliveryShift: 'MORNING',
    status: SubscriptionStatus.ACTIVE,
    startDate: '2026-08-01',
    endDate: null as string | null,
  };

  it('detects overlapping active subscriptions', () => {
    expect(
      hasActiveSubscriptionOverlap(base, [
        {
          id: 's1',
          ...base,
          startDate: '2026-07-01',
          endDate: null,
        },
      ]),
    ).toBe(true);
  });

  it('allows non-overlapping date ranges', () => {
    expect(
      hasActiveSubscriptionOverlap({ ...base, startDate: '2026-09-01' }, [
        {
          id: 's1',
          ...base,
          startDate: '2026-07-01',
          endDate: '2026-08-31',
        },
      ]),
    ).toBe(false);
  });

  it('ignores non-active subscriptions', () => {
    expect(
      hasActiveSubscriptionOverlap(base, [
        {
          id: 's1',
          ...base,
          status: SubscriptionStatus.PAUSED,
        },
      ]),
    ).toBe(false);
  });

  it('ignores different milk type or shift', () => {
    expect(
      hasActiveSubscriptionOverlap(base, [
        { id: 's1', ...base, milkType: 'BUFFALO' },
        { id: 's2', ...base, deliveryShift: 'EVENING' },
      ]),
    ).toBe(false);
  });
});

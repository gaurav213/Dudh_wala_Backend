import { planRateChange } from './milk-rate.util';

describe('planRateChange', () => {
  it('creates an initial open period when none exists', () => {
    const plan = planRateChange(null, '55.00', '2026-08-01');
    expect(plan.closedPreviousId).toBeNull();
    expect(plan.closedEffectiveTo).toBeNull();
    expect(plan.newPeriod).toEqual({
      ratePerLitre: '55.00',
      effectiveFrom: '2026-08-01',
      effectiveTo: null,
    });
  });

  it('closes the previous open period at the new effective date', () => {
    const plan = planRateChange(
      {
        id: 'r1',
        ratePerLitre: '50.00',
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
      },
      '55.00',
      '2026-08-01',
    );
    expect(plan.closedPreviousId).toBe('r1');
    expect(plan.closedEffectiveTo).toBe('2026-08-01');
    expect(plan.newPeriod).toEqual({
      ratePerLitre: '55.00',
      effectiveFrom: '2026-08-01',
      effectiveTo: null,
    });
  });

  it('rejects a new effective date on or before the current period start', () => {
    const openPeriod = {
      id: 'r1',
      ratePerLitre: '50.00',
      effectiveFrom: '2026-08-01',
      effectiveTo: null,
    };
    expect(() => planRateChange(openPeriod, '55.00', '2026-08-01')).toThrow();
    expect(() => planRateChange(openPeriod, '55.00', '2026-07-15')).toThrow();
  });

  it('allows a new effective date strictly after the current period start', () => {
    const openPeriod = {
      id: 'r1',
      ratePerLitre: '50.00',
      effectiveFrom: '2026-08-01',
      effectiveTo: null,
    };
    expect(() =>
      planRateChange(openPeriod, '55.00', '2026-08-02'),
    ).not.toThrow();
  });
});

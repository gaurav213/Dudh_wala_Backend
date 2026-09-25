import { splitFarmBillRemainings } from './farm-bill-remainings.util';

describe('splitFarmBillRemainings', () => {
  it('keeps ₹60 due separate from ₹5 advance', () => {
    expect(splitFarmBillRemainings(['60', '-5'])).toEqual({
      toCollect: '60.00',
      advanceBalance: '5.00',
    });
  });

  it('does not net a single positive and negative into 55', () => {
    const r = splitFarmBillRemainings([60, -5]);
    expect(r.toCollect).not.toBe('55.00');
    expect(r.toCollect).toBe('60.00');
  });
});

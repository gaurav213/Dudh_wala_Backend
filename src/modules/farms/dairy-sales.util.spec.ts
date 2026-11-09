import { dairyMonthSummary, slipAmount } from './dairy-sales.util';

describe('dairy sales money', () => {
  it('computes amount as litres times rate', () => {
    expect(slipAmount('12.5', '48')).toBe('600.00');
    expect(slipAmount('2', '52.50')).toBe('105.00');
  });

  it('due is sold minus received, and another dairy stays separate', () => {
    const summary = dairyMonthSummary({
      today: '2026-10-11',
      month: '2026-10',
      slips: [
        { dairyName: 'Amul', slipDate: '2026-10-11', amount: '600.00' },
        { dairyName: 'Amul', slipDate: '2026-10-02', amount: '400.00' },
        { dairyName: 'Local', slipDate: '2026-09-30', amount: '999.00' },
      ],
      payments: [
        { dairyName: 'Amul', paidOn: '2026-10-05', amount: '400.00' },
        { dairyName: 'Local', paidOn: '2026-10-01', amount: '50.00' },
      ],
    });
    expect(summary.todaySold).toBe('600.00');
    expect(summary.monthSold).toBe('1000.00');
    expect(summary.monthReceived).toBe('450.00');
    expect(summary.monthDue).toBe('550.00');
    expect(summary.dairies).toEqual([
      { dairyName: 'Amul', sold: '1000.00', received: '400.00', due: '600.00' },
      { dairyName: 'Local', sold: '0.00', received: '50.00', due: '-50.00' },
    ]);
  });
});

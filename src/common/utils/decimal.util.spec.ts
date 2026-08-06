import {
  calculateAmount,
  calculateBillTotals,
  roundMoney,
} from './decimal.util';

describe('decimal.util', () => {
  describe('calculateAmount', () => {
    it('multiplies quantity and rate with 2dp rounding', () => {
      expect(calculateAmount('1.500', '60.00')).toBe('90.00');
      expect(calculateAmount('1.333', '45.50')).toBe('60.65');
      expect(calculateAmount('0', '60')).toBe('0.00');
    });

    it('avoids floating point drift', () => {
      expect(calculateAmount('0.1', '0.2')).toBe('0.02');
      expect(calculateAmount('1.005', '10')).toBe('10.05');
    });
  });

  describe('calculateBillTotals', () => {
    it('computes subtotal, total and remaining balance', () => {
      const result = calculateBillTotals({
        milkAmount: '900.00',
        previousBalance: '100.00',
        adjustment: '50.00',
        discount: '25.00',
        paidAmount: '400.00',
      });
      expect(result.subtotal).toBe('1050.00');
      expect(result.totalAmount).toBe('1025.00');
      expect(result.remainingBalance).toBe('625.00');
      expect(result.milkAmount).toBe('900.00');
    });

    it('handles previous balance and partial payments', () => {
      const result = calculateBillTotals({
        milkAmount: '500.00',
        previousBalance: '200.00',
        paidAmount: '300.00',
      });
      expect(result.totalAmount).toBe('700.00');
      expect(result.remainingBalance).toBe('400.00');
      expect(roundMoney(result.previousBalance)).toBe('200.00');
    });
  });
});

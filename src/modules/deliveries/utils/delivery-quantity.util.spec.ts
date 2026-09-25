import {
  expectedQuantity,
  staffExtraFromFinal,
} from './delivery-quantity.util';

describe('delivery-quantity.util', () => {
  describe('expectedQuantity', () => {
    it('sums scheduled + customer extra + staff extra', () => {
      expect(
        expectedQuantity({
          scheduledQuantity: '1',
          customerExtraQuantity: '0.5',
          staffExtraQuantity: '0.5',
        }),
      ).toBe('2.000');
    });
  });

  describe('staffExtraFromFinal', () => {
    it('treats poured above daily need as staff extra', () => {
      expect(
        staffExtraFromFinal({
          finalDeliveredQuantity: '2',
          scheduledQuantity: '1',
          customerExtraQuantity: '0',
        }),
      ).toBe('1.000');
    });

    it('subtracts accepted customer extra before computing staff extra', () => {
      expect(
        staffExtraFromFinal({
          finalDeliveredQuantity: '2',
          scheduledQuantity: '1',
          customerExtraQuantity: '0.5',
        }),
      ).toBe('0.500');
    });

    it('returns zero when poured is at or below scheduled + customer extra', () => {
      expect(
        staffExtraFromFinal({
          finalDeliveredQuantity: '1',
          scheduledQuantity: '1',
          customerExtraQuantity: '0',
        }),
      ).toBe('0.000');
      expect(
        staffExtraFromFinal({
          finalDeliveredQuantity: '0.5',
          scheduledQuantity: '1',
          customerExtraQuantity: '0',
        }),
      ).toBe('0.000');
    });
  });
});

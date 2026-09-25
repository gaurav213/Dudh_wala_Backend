import {
  resolveEffectiveStartDate,
  validateServiceRequestAgainstProduct,
} from './service-request-validation.util';

describe('validateServiceRequestAgainstProduct', () => {
  const product = {
    isAvailable: true,
    minimumQuantity: '0.500',
    maximumQuantity: '5.000',
    availableShifts: ['MORNING'],
  };

  it('returns no errors for a valid request', () => {
    expect(
      validateServiceRequestAgainstProduct(
        { quantity: '1.500', deliveryShift: 'MORNING' },
        product,
      ),
    ).toEqual([]);
  });

  it('flags unavailable products and short-circuits other checks', () => {
    expect(
      validateServiceRequestAgainstProduct(
        { quantity: '1.500', deliveryShift: 'MORNING' },
        { ...product, isAvailable: false },
      ),
    ).toEqual(['PRODUCT_UNAVAILABLE']);
  });

  it('flags quantity below minimum', () => {
    expect(
      validateServiceRequestAgainstProduct(
        { quantity: '0.100', deliveryShift: 'MORNING' },
        product,
      ),
    ).toContain('QUANTITY_BELOW_MINIMUM');
  });

  it('flags quantity above maximum', () => {
    expect(
      validateServiceRequestAgainstProduct(
        { quantity: '10.000', deliveryShift: 'MORNING' },
        product,
      ),
    ).toContain('QUANTITY_ABOVE_MAXIMUM');
  });

  it('allows any quantity when maximumQuantity is null', () => {
    expect(
      validateServiceRequestAgainstProduct(
        { quantity: '100.000', deliveryShift: 'MORNING' },
        { ...product, maximumQuantity: null },
      ),
    ).toEqual([]);
  });

  it('flags a shift not offered by the product', () => {
    expect(
      validateServiceRequestAgainstProduct(
        { quantity: '1.500', deliveryShift: 'EVENING' },
        product,
      ),
    ).toContain('SHIFT_NOT_OFFERED');
  });

  it('can report multiple errors at once', () => {
    const errors = validateServiceRequestAgainstProduct(
      { quantity: '10.000', deliveryShift: 'EVENING' },
      product,
    );
    expect(errors).toEqual(
      expect.arrayContaining(['QUANTITY_ABOVE_MAXIMUM', 'SHIFT_NOT_OFFERED']),
    );
  });
});

describe('resolveEffectiveStartDate', () => {
  it('keeps a future preferred date', () => {
    expect(resolveEffectiveStartDate('2026-09-01', '2026-08-06')).toBe(
      '2026-09-01',
    );
  });

  it('bumps a past preferred date up to today', () => {
    expect(resolveEffectiveStartDate('2026-01-01', '2026-08-06')).toBe(
      '2026-08-06',
    );
  });

  it('keeps today unchanged', () => {
    expect(resolveEffectiveStartDate('2026-08-06', '2026-08-06')).toBe(
      '2026-08-06',
    );
  });
});

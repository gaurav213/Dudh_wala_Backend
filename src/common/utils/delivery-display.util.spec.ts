import { milkTypeLabel, resolveProductName } from './delivery-display.util';

describe('delivery-display.util', () => {
  it('labels milk types', () => {
    expect(milkTypeLabel('COW')).toBe('Cow milk');
    expect(milkTypeLabel('BUFFALO')).toBe('Buffalo milk');
    expect(milkTypeLabel(null)).toBe('Milk');
  });

  it('prefers product name over milk type', () => {
    expect(
      resolveProductName({ productName: 'A2 Cow', milkType: 'COW' }),
    ).toBe('A2 Cow');
    expect(resolveProductName({ milkType: 'BUFFALO' })).toBe('Buffalo milk');
  });
});

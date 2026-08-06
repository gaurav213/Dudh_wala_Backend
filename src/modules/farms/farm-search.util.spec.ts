import { ServiceAreaStatus } from '../../common/enums';
import { matchesProduct, matchesServiceArea } from './farm-search.util';

describe('matchesServiceArea', () => {
  const area = {
    status: ServiceAreaStatus.ACTIVE,
    areaName: 'Kothrud',
    city: 'Pune',
    postalCode: '411038',
  };

  it('rejects inactive service areas', () => {
    expect(
      matchesServiceArea({ ...area, status: ServiceAreaStatus.INACTIVE }, {}),
    ).toBe(false);
  });

  it('matches on exact postal code', () => {
    expect(matchesServiceArea(area, { postalCode: '411038' })).toBe(true);
    expect(matchesServiceArea(area, { postalCode: '411001' })).toBe(false);
  });

  it('matches area/city case-insensitively as substring', () => {
    expect(matchesServiceArea(area, { area: 'koth' })).toBe(true);
    expect(matchesServiceArea(area, { city: 'PUNE' })).toBe(true);
    expect(matchesServiceArea(area, { city: 'Mumbai' })).toBe(false);
  });

  it('matches everything when no filters are provided', () => {
    expect(matchesServiceArea(area, {})).toBe(true);
  });
});

describe('matchesProduct', () => {
  const product = {
    isAvailable: true,
    milkType: 'COW',
    availableShifts: ['MORNING'],
  };

  it('rejects unavailable products', () => {
    expect(matchesProduct({ ...product, isAvailable: false }, {})).toBe(false);
  });

  it('matches milk type when provided', () => {
    expect(matchesProduct(product, { milkType: 'COW' })).toBe(true);
    expect(matchesProduct(product, { milkType: 'BUFFALO' })).toBe(false);
  });

  it('matches delivery shift when provided', () => {
    expect(matchesProduct(product, { deliveryShift: 'MORNING' })).toBe(true);
    expect(matchesProduct(product, { deliveryShift: 'EVENING' })).toBe(false);
  });

  it('matches everything when no filters are provided', () => {
    expect(matchesProduct(product, {})).toBe(true);
  });
});

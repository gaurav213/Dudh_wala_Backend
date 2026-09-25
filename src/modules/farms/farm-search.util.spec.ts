import { ServiceAreaStatus } from '../../common/enums';
import {
  computeServiceAreaMatchTier,
  matchesProduct,
  matchesServiceArea,
  ServiceAreaLike,
} from './farm-search.util';

function area(overrides: Partial<ServiceAreaLike> = {}): ServiceAreaLike {
  return {
    status: ServiceAreaStatus.ACTIVE,
    areaName: 'Kothrud',
    city: 'Pune',
    postalCode: '411038',
    ...overrides,
  };
}

describe('matchesServiceArea', () => {
  it('rejects inactive service areas regardless of location filters', () => {
    expect(
      matchesServiceArea(area({ status: ServiceAreaStatus.INACTIVE }), {}),
    ).toBe(false);
  });

  it('matches on exact postal code', () => {
    expect(matchesServiceArea(area(), { postalCode: '411038' })).toBe(true);
    expect(matchesServiceArea(area(), { postalCode: '411057' })).toBe(false);
  });

  it('matches area case-insensitively as a substring', () => {
    expect(matchesServiceArea(area(), { area: 'kothrud' })).toBe(true);
    expect(matchesServiceArea(area(), { area: 'Baner' })).toBe(false);
  });

  it('matches city case-insensitively as a substring', () => {
    expect(matchesServiceArea(area(), { city: 'pune' })).toBe(true);
    expect(matchesServiceArea(area(), { city: 'Mumbai' })).toBe(false);
  });

  it('requires all provided filters to match simultaneously', () => {
    expect(
      matchesServiceArea(area(), { area: 'Kothrud', city: 'Mumbai' }),
    ).toBe(false);
    expect(matchesServiceArea(area(), { area: 'Kothrud', city: 'Pune' })).toBe(
      true,
    );
  });

  it('matches everything when no filters are supplied', () => {
    expect(matchesServiceArea(area(), {})).toBe(true);
  });
});

describe('matchesProduct', () => {
  const product = {
    isAvailable: true,
    milkType: 'COW',
    availableShifts: ['MORNING', 'EVENING'],
  };

  it('rejects unavailable products', () => {
    expect(matchesProduct({ ...product, isAvailable: false }, {})).toBe(false);
  });

  it('matches on milk type', () => {
    expect(matchesProduct(product, { milkType: 'COW' })).toBe(true);
    expect(matchesProduct(product, { milkType: 'BUFFALO' })).toBe(false);
  });

  it('matches on delivery shift membership', () => {
    expect(matchesProduct(product, { deliveryShift: 'MORNING' })).toBe(true);
    expect(matchesProduct(product, { deliveryShift: 'NIGHT' })).toBe(false);
  });

  it('matches everything when no filters are supplied', () => {
    expect(matchesProduct(product, {})).toBe(true);
  });
});

describe('computeServiceAreaMatchTier', () => {
  it('returns NONE when no location filters are supplied', () => {
    expect(computeServiceAreaMatchTier([area()], {})).toBe('NONE');
  });

  it('prioritizes exact postal code over area/city matches', () => {
    const areas = [area({ postalCode: '411038', areaName: 'Kothrud' })];
    expect(
      computeServiceAreaMatchTier(areas, {
        postalCode: '411038',
        area: 'Kothrud',
        city: 'Pune',
      }),
    ).toBe('EXACT_PIN');
  });

  it('falls back to area+city when the postal code does not match', () => {
    const areas = [area({ postalCode: '411099', areaName: 'Kothrud' })];
    expect(
      computeServiceAreaMatchTier(areas, {
        postalCode: '411038',
        area: 'Kothrud',
        city: 'Pune',
      }),
    ).toBe('AREA_CITY');
  });

  it('falls back to city alone when area does not match', () => {
    const areas = [area({ areaName: 'Baner', city: 'Pune' })];
    expect(
      computeServiceAreaMatchTier(areas, { area: 'Kothrud', city: 'Pune' }),
    ).toBe('CITY');
  });

  it('returns NONE when nothing overlaps', () => {
    const areas = [
      area({ city: 'Mumbai', areaName: 'Andheri', postalCode: '400058' }),
    ];
    expect(
      computeServiceAreaMatchTier(areas, {
        postalCode: '411038',
        area: 'Kothrud',
        city: 'Pune',
      }),
    ).toBe('NONE');
  });

  it('ignores inactive service areas', () => {
    const areas = [
      area({ status: ServiceAreaStatus.INACTIVE, postalCode: '411038' }),
    ];
    expect(computeServiceAreaMatchTier(areas, { postalCode: '411038' })).toBe(
      'NONE',
    );
  });
});

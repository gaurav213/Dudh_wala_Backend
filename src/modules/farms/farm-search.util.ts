import { ServiceAreaStatus } from '../../common/enums';

/** Pure predicate helpers for marketplace farm search (unit-tested). */
export interface ServiceAreaLike {
  status: ServiceAreaStatus;
  areaName: string;
  city: string;
  postalCode: string | null;
}

export interface SearchAreaFilters {
  postalCode?: string;
  area?: string;
  city?: string;
}

export function matchesServiceArea(
  serviceArea: ServiceAreaLike,
  filters: SearchAreaFilters,
): boolean {
  if (serviceArea.status !== ServiceAreaStatus.ACTIVE) return false;
  if (filters.postalCode && serviceArea.postalCode !== filters.postalCode) {
    return false;
  }
  if (
    filters.area &&
    !serviceArea.areaName.toLowerCase().includes(filters.area.toLowerCase())
  ) {
    return false;
  }
  if (
    filters.city &&
    !serviceArea.city.toLowerCase().includes(filters.city.toLowerCase())
  ) {
    return false;
  }
  return true;
}

export interface ProductLike {
  isAvailable: boolean;
  milkType: string;
  availableShifts: string[];
}

export interface SearchProductFilters {
  milkType?: string;
  deliveryShift?: string;
}

export function matchesProduct(
  product: ProductLike,
  filters: SearchProductFilters,
): boolean {
  if (!product.isAvailable) return false;
  if (filters.milkType && product.milkType !== filters.milkType) {
    return false;
  }
  if (
    filters.deliveryShift &&
    !product.availableShifts.includes(filters.deliveryShift)
  ) {
    return false;
  }
  return true;
}

export type ServiceAreaMatchTier = 'EXACT_PIN' | 'AREA_CITY' | 'CITY' | 'NONE';

/**
 * Ranks a farm's active service areas against the requested location
 * filters, preferring the most specific match: exact postal code, then
 * area+city, then city alone.
 */
export function computeServiceAreaMatchTier(
  areas: ServiceAreaLike[],
  filters: SearchAreaFilters,
): ServiceAreaMatchTier {
  if (!filters.postalCode && !filters.area && !filters.city) return 'NONE';
  const activeAreas = areas.filter(
    (a) => a.status === ServiceAreaStatus.ACTIVE,
  );
  if (
    filters.postalCode &&
    activeAreas.some((a) =>
      matchesServiceArea(a, { postalCode: filters.postalCode }),
    )
  ) {
    return 'EXACT_PIN';
  }
  if (
    filters.area &&
    filters.city &&
    activeAreas.some((a) =>
      matchesServiceArea(a, { area: filters.area, city: filters.city }),
    )
  ) {
    return 'AREA_CITY';
  }
  if (
    filters.city &&
    activeAreas.some((a) => matchesServiceArea(a, { city: filters.city }))
  ) {
    return 'CITY';
  }
  return 'NONE';
}

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

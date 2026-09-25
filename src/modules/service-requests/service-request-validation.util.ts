import { Decimal } from 'decimal.js';

/** Pure predicate/validation helpers for service-request creation (unit-tested). */

export interface ProductLimitsLike {
  isAvailable: boolean;
  minimumQuantity: string;
  maximumQuantity: string | null;
  availableShifts: string[];
}

export interface ServiceRequestInput {
  quantity: string;
  deliveryShift: string;
}

export type ServiceRequestValidationError =
  | 'PRODUCT_UNAVAILABLE'
  | 'QUANTITY_BELOW_MINIMUM'
  | 'QUANTITY_ABOVE_MAXIMUM'
  | 'SHIFT_NOT_OFFERED';

/**
 * Validates a requested quantity/shift against a farm product's limits.
 * Returns an array of validation error codes (empty when valid).
 */
export function validateServiceRequestAgainstProduct(
  input: ServiceRequestInput,
  product: ProductLimitsLike,
): ServiceRequestValidationError[] {
  const errors: ServiceRequestValidationError[] = [];

  if (!product.isAvailable) {
    errors.push('PRODUCT_UNAVAILABLE');
    return errors;
  }

  const qty = new Decimal(input.quantity);
  if (qty.lt(new Decimal(product.minimumQuantity))) {
    errors.push('QUANTITY_BELOW_MINIMUM');
  }
  if (
    product.maximumQuantity !== null &&
    qty.gt(new Decimal(product.maximumQuantity))
  ) {
    errors.push('QUANTITY_ABOVE_MAXIMUM');
  }
  if (!product.availableShifts.includes(input.deliveryShift)) {
    errors.push('SHIFT_NOT_OFFERED');
  }

  return errors;
}

/**
 * Chooses the effective subscription start date: never before today
 * (a customer cannot request a start date in the past).
 */
export function resolveEffectiveStartDate(
  preferredStartDate: string,
  todayIso: string,
): string {
  return preferredStartDate < todayIso ? todayIso : preferredStartDate;
}

import { Decimal } from 'decimal.js';
import {
  calculateAmount,
  roundMoney,
  roundQty,
} from '../../../common/utils/decimal.util';

export function expectedQuantity(parts: {
  scheduledQuantity: string;
  customerExtraQuantity?: string | null;
  staffExtraQuantity?: string | null;
}): string {
  const total = new Decimal(parts.scheduledQuantity || 0)
    .plus(parts.customerExtraQuantity || 0)
    .plus(parts.staffExtraQuantity || 0);
  return roundQty(total.toString());
}

/**
 * Staff extra is whatever was poured above the daily need + accepted customer extra.
 * Example: scheduled 1L, customer extra 0, final 2L → staff extra 1L.
 */
export function staffExtraFromFinal(parts: {
  finalDeliveredQuantity: string;
  scheduledQuantity: string;
  customerExtraQuantity?: string | null;
}): string {
  const extra = new Decimal(parts.finalDeliveredQuantity || 0)
    .minus(parts.scheduledQuantity || 0)
    .minus(parts.customerExtraQuantity || 0);
  return roundQty(Decimal.max(0, extra).toString());
}

export function amountForQuantity(
  quantity: string,
  ratePerLitre: string,
): string {
  return calculateAmount(roundQty(quantity), roundMoney(ratePerLitre));
}

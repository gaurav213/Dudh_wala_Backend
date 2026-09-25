import { Decimal } from 'decimal.js';
import { DeliveryStatus } from '../../../common/enums';
import { roundMoney, roundQty } from '../../../common/utils/decimal.util';

export type DeliveryMetricRow = {
  status: DeliveryStatus | string;
  scheduledQuantity?: string | null;
  customerExtraQuantity?: string | null;
  staffExtraQuantity?: string | null;
  finalDeliveredQuantity?: string | null;
  quantity?: string | null;
  isEdited?: boolean | null;
};

export type FarmTodayMetrics = {
  scheduledQuantity: string;
  customerExtraQuantity: string;
  staffExtraQuantity: string;
  totalExtraQuantity: string;
  totalDeliveredQuantity: string;
  pendingCount: number;
  deliveredCount: number;
  skippedCount: number;
  failedCount: number;
  outForDeliveryCount: number;
  editedDeliveryCount: number;
  totalCount: number;
};

function sumQty(
  rows: DeliveryMetricRow[],
  pick: (r: DeliveryMetricRow) => string | null | undefined,
) {
  return roundQty(
    rows.reduce((acc, r) => acc.plus(pick(r) || 0), new Decimal(0)).toString(),
  );
}

/** Authoritative today metrics for farm/staff dashboards. */
export function aggregateFarmTodayMetrics(
  rows: DeliveryMetricRow[],
): FarmTodayMetrics {
  const delivered = rows.filter((r) => r.status === DeliveryStatus.DELIVERED);
  const scheduledQuantity = sumQty(rows, (r) => r.scheduledQuantity);
  const customerExtraQuantity = sumQty(rows, (r) => r.customerExtraQuantity);
  const staffExtraQuantity = sumQty(rows, (r) => r.staffExtraQuantity);
  const totalExtraQuantity = roundQty(
    new Decimal(customerExtraQuantity).plus(staffExtraQuantity).toString(),
  );
  const totalDeliveredQuantity = sumQty(
    delivered,
    (r) => r.finalDeliveredQuantity ?? r.quantity,
  );

  return {
    scheduledQuantity,
    customerExtraQuantity,
    staffExtraQuantity,
    totalExtraQuantity,
    totalDeliveredQuantity,
    pendingCount: rows.filter((r) => r.status === DeliveryStatus.PENDING)
      .length,
    deliveredCount: delivered.length,
    skippedCount: rows.filter((r) => r.status === DeliveryStatus.SKIPPED)
      .length,
    failedCount: rows.filter((r) => r.status === DeliveryStatus.FAILED).length,
    outForDeliveryCount: rows.filter(
      (r) => r.status === DeliveryStatus.OUT_FOR_DELIVERY,
    ).length,
    editedDeliveryCount: rows.filter((r) => r.isEdited).length,
    totalCount: rows.length,
  };
}

export function editReasonLabel(reason: string): string {
  switch (reason) {
    case 'ENTERED_WRONG_QUANTITY':
      return 'Entered wrong quantity';
    case 'CUSTOMER_CORRECTED_QUANTITY':
      return 'Customer corrected quantity';
    case 'EXTRA_MILK_ENTERED_INCORRECTLY':
      return 'Extra milk entered incorrectly';
    case 'OTHER':
      return 'Other';
    default:
      return reason;
  }
}

export function formatAmountInr(amount: string): string {
  return `₹${roundMoney(amount)}`;
}

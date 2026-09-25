import { DeliveryStatus } from '../../../common/enums';
import { aggregateFarmTodayMetrics } from './farm-today-metrics.util';

describe('aggregateFarmTodayMetrics', () => {
  it('matches acceptance scenario 1 for scheduled/extra/delivered', () => {
    const metrics = aggregateFarmTodayMetrics([
      {
        status: DeliveryStatus.DELIVERED,
        scheduledQuantity: '1.5',
        customerExtraQuantity: '0.5',
        staffExtraQuantity: '0',
        finalDeliveredQuantity: '2.0',
      },
      {
        status: DeliveryStatus.DELIVERED,
        scheduledQuantity: '2.0',
        customerExtraQuantity: '0',
        staffExtraQuantity: '1.0',
        finalDeliveredQuantity: '3.0',
      },
      {
        status: DeliveryStatus.DELIVERED,
        scheduledQuantity: '1.0',
        customerExtraQuantity: '0',
        staffExtraQuantity: '0',
        finalDeliveredQuantity: '1.0',
      },
    ]);

    expect(metrics.scheduledQuantity).toBe('4.500');
    expect(metrics.customerExtraQuantity).toBe('0.500');
    expect(metrics.staffExtraQuantity).toBe('1.000');
    expect(metrics.totalExtraQuantity).toBe('1.500');
    expect(metrics.totalDeliveredQuantity).toBe('6.000');
    expect(metrics.deliveredCount).toBe(3);
  });

  it('counts pending/skipped/edited separately', () => {
    const metrics = aggregateFarmTodayMetrics([
      {
        status: DeliveryStatus.PENDING,
        scheduledQuantity: '1',
        customerExtraQuantity: '0',
        staffExtraQuantity: '0',
        isEdited: false,
      },
      {
        status: DeliveryStatus.SKIPPED,
        scheduledQuantity: '1',
        customerExtraQuantity: '0',
        staffExtraQuantity: '0',
        isEdited: false,
      },
      {
        status: DeliveryStatus.DELIVERED,
        scheduledQuantity: '1',
        customerExtraQuantity: '0',
        staffExtraQuantity: '0',
        finalDeliveredQuantity: '1',
        isEdited: true,
      },
    ]);
    expect(metrics.pendingCount).toBe(1);
    expect(metrics.skippedCount).toBe(1);
    expect(metrics.editedDeliveryCount).toBe(1);
  });
});

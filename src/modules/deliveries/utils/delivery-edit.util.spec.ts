import { DeliveryEditReason } from '../../../common/enums';
import { editReasonLabel } from './farm-today-metrics.util';

describe('delivery edit helpers', () => {
  it('maps edit reasons to human labels', () => {
    expect(editReasonLabel(DeliveryEditReason.ENTERED_WRONG_QUANTITY)).toBe(
      'Entered wrong quantity',
    );
    expect(editReasonLabel(DeliveryEditReason.OTHER)).toBe('Other');
  });
});

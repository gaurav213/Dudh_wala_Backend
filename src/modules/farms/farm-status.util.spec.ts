import { FarmStatus } from '../../common/enums';
import {
  canRejectFarm,
  nextFarmStatusOnApprove,
  nextFarmStatusOnSuspend,
} from './farm-status.util';

describe('farm status transitions', () => {
  it('allows reject only from PENDING_APPROVAL', () => {
    expect(canRejectFarm(FarmStatus.PENDING_APPROVAL)).toBe(true);
    expect(canRejectFarm(FarmStatus.ACTIVE)).toBe(false);
    expect(canRejectFarm(FarmStatus.SUSPENDED)).toBe(false);
  });

  it('maps approve and suspend targets', () => {
    expect(nextFarmStatusOnApprove()).toBe(FarmStatus.ACTIVE);
    expect(nextFarmStatusOnSuspend()).toBe(FarmStatus.SUSPENDED);
  });
});

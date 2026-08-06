import { FarmStatus } from '../../common/enums';

/** Pure helpers for farm approval state machine (unit-tested). */
export function canRejectFarm(status: FarmStatus): boolean {
  return status === FarmStatus.PENDING_APPROVAL;
}

export function nextFarmStatusOnApprove(): FarmStatus {
  return FarmStatus.ACTIVE;
}

export function nextFarmStatusOnSuspend(): FarmStatus {
  return FarmStatus.SUSPENDED;
}

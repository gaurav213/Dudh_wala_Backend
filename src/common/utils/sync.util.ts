export type SyncResultStatus =
  'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';

export interface SyncConflictCheckInput {
  operationId: string;
  alreadyProcessed: boolean;
  previousResultStatus?: SyncResultStatus | null;
  baseVersion: number;
  serverVersion: number | null; // null = entity does not exist yet
  operationType: 'CREATE' | 'UPDATE' | 'DELETE';
}

export interface SyncConflictCheckResult {
  status: SyncResultStatus;
  reason?: string;
}

/**
 * Pure sync decision helper for idempotency and optimistic concurrency.
 */
export function evaluateSyncOperation(
  input: SyncConflictCheckInput,
): SyncConflictCheckResult {
  if (input.alreadyProcessed) {
    return {
      status: 'DUPLICATE',
      reason: 'operationId already processed',
    };
  }

  if (input.operationType === 'CREATE') {
    if (input.serverVersion !== null) {
      return {
        status: 'CONFLICT',
        reason: 'entity already exists',
      };
    }
    return { status: 'APPLIED' };
  }

  if (input.serverVersion === null) {
    return {
      status: 'REJECTED',
      reason: 'entity not found',
    };
  }

  if (input.baseVersion !== input.serverVersion) {
    return {
      status: 'CONFLICT',
      reason: 'stale baseVersion',
    };
  }

  return { status: 'APPLIED' };
}

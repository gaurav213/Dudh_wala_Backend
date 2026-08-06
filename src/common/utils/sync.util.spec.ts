import { evaluateSyncOperation } from './sync.util';

describe('evaluateSyncOperation', () => {
  it('returns DUPLICATE when operationId already processed', () => {
    const result = evaluateSyncOperation({
      operationId: 'op-1',
      alreadyProcessed: true,
      baseVersion: 1,
      serverVersion: 1,
      operationType: 'UPDATE',
    });
    expect(result.status).toBe('DUPLICATE');
  });

  it('returns CONFLICT when baseVersion is stale', () => {
    const result = evaluateSyncOperation({
      operationId: 'op-2',
      alreadyProcessed: false,
      baseVersion: 1,
      serverVersion: 3,
      operationType: 'UPDATE',
    });
    expect(result.status).toBe('CONFLICT');
    expect(result.reason).toBe('stale baseVersion');
  });

  it('returns APPLIED for create when entity missing', () => {
    const result = evaluateSyncOperation({
      operationId: 'op-3',
      alreadyProcessed: false,
      baseVersion: 0,
      serverVersion: null,
      operationType: 'CREATE',
    });
    expect(result.status).toBe('APPLIED');
  });

  it('returns CONFLICT for create when entity exists', () => {
    const result = evaluateSyncOperation({
      operationId: 'op-4',
      alreadyProcessed: false,
      baseVersion: 0,
      serverVersion: 1,
      operationType: 'CREATE',
    });
    expect(result.status).toBe('CONFLICT');
  });

  it('returns REJECTED for update when entity missing', () => {
    const result = evaluateSyncOperation({
      operationId: 'op-5',
      alreadyProcessed: false,
      baseVersion: 1,
      serverVersion: null,
      operationType: 'UPDATE',
    });
    expect(result.status).toBe('REJECTED');
  });
});

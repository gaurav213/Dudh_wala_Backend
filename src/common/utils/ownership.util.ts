import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../enums';

export interface AuthUserLike {
  id: string;
  role: UserRole;
}

/** Platform owner bypass; farm owners match legacy supplier_id = user.id */
export function assertSupplierOwnership(
  user: AuthUserLike,
  ownerSupplierId: string,
  resourceName = 'Resource',
): void {
  if (user.role === UserRole.PLATFORM_OWNER) {
    return;
  }
  if (user.role !== UserRole.FARM_OWNER) {
    throw new ForbiddenException(`Only farm owners can access ${resourceName}`);
  }
  if (user.id !== ownerSupplierId) {
    throw new ForbiddenException(`You do not own this ${resourceName}`);
  }
}

export function assertFound<T>(
  entity: T | null | undefined,
  message = 'Resource not found',
): T {
  if (!entity) {
    throw new NotFoundException(message);
  }
  return entity;
}

/**
 * Legacy ledger ownership: farm owner user id is still stamped as supplier_id
 * until Phase 5+ migrates those tables to farm_id.
 */
export function getSupplierIdOrThrow(user: AuthUserLike): string {
  if (user.role === UserRole.PLATFORM_OWNER) {
    throw new ForbiddenException(
      'Platform owner must specify farm/supplier context for this operation',
    );
  }
  if (user.role !== UserRole.FARM_OWNER) {
    throw new ForbiddenException('Farm owner access required');
  }
  return user.id;
}

export function isPlatformOwner(user: AuthUserLike): boolean {
  return user.role === UserRole.PLATFORM_OWNER;
}

export function isFarmOwner(user: AuthUserLike): boolean {
  return user.role === UserRole.FARM_OWNER;
}

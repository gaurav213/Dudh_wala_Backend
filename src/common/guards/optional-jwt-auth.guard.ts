import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Behaves like JwtAuthGuard when a valid bearer token is present, but never
 * throws when the token is missing or invalid — `request.user` is simply
 * left undefined so public callers keep working. Routes that require an
 * authenticated user for a specific feature (e.g. addressId-based search)
 * must check for `user` themselves and throw explicitly.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T = unknown>(_err: unknown, user: T | false): T | undefined {
    return user ? user : undefined;
  }
}

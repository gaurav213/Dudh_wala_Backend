/**
 * Resolves Postgres SSL options for TypeORM / node-pg.
 * Render external Postgres requires SSL; local Docker typically does not.
 */
export function resolvePostgresSsl(
  databaseUrl?: string,
  sslEnv?: string,
): boolean | { rejectUnauthorized: boolean } | undefined {
  const flag = (sslEnv || '').trim().toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'require') {
    // Render managed certs are often not in the local trust store.
    return { rejectUnauthorized: false };
  }
  if (flag === 'false' || flag === '0' || flag === 'disable') {
    return false;
  }

  if (!databaseUrl) {
    return undefined;
  }

  const isRender =
    databaseUrl.includes('render.com') ||
    databaseUrl.includes('.oregon-postgres.render.com') ||
    databaseUrl.includes('.singapore-postgres.render.com') ||
    databaseUrl.includes('.frankfurt-postgres.render.com') ||
    databaseUrl.includes('.ohio-postgres.render.com') ||
    databaseUrl.includes('.virginia-postgres.render.com');

  if (isRender || databaseUrl.includes('sslmode=require')) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

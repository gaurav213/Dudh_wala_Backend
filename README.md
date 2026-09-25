# Doodh Wala Backend (`doodh-khata-backend`)

NestJS + PostgreSQL API for **Doodh Wala** — multi-farm milk-delivery marketplace.
Repository and package names remain `doodh-khata-*` for deployment continuity.

- Base path: `/api/v1`
- Swagger: `/api/docs`
- Health: `GET /api/v1/health`
- Default timezone: `Asia/Kolkata`
- Money/qty: PostgreSQL `numeric`, API strings via Decimal.js

## Roles (Phase 2+)

| Role | Purpose |
|------|---------|
| `PLATFORM_OWNER` | Approve/suspend farms, platform admin |
| `FARM_OWNER` | Register farm, manage farm (ledger APIs still use owner user id as `supplier_id` until later phases) |
| `DELIVERY_STAFF` | Delivery operations (full flows in later phases) |
| `CUSTOMER` | Independent customers (registration in Phase 3–4) |

## Farm registration

```text
POST /api/v1/auth/register/farm-owner
```

Creates user + farm. Farm status is `PENDING_APPROVAL` unless `AUTO_APPROVE_FARMS=true`.

Platform owner:

```text
GET  /api/v1/admin/farms
POST /api/v1/admin/farms/:id/approve
POST /api/v1/admin/farms/:id/reject
POST /api/v1/admin/farms/:id/suspend
POST /api/v1/admin/farms/:id/reactivate
```

Farm owner:

```text
POST  /api/v1/farms
GET   /api/v1/farms/my
GET   /api/v1/farms/:id
PATCH /api/v1/farms/:id
GET   /api/v1/farms/:farmId/members
```

## Prerequisites

- Node.js 22+
- PostgreSQL 16+
- npm

## Quick start

```bash
cp .env.example .env
# edit JWT secrets and DATABASE_URL

NPM_CONFIG_REGISTRY=https://registry.npmjs.org npm install
npm run migration:run
npm run seed          # development only
npm run start:dev
```

Docker (Postgres + API):

```bash
cp .env.example .env
docker compose up --build
```

## Environment

See [`.env.example`](.env.example). Startup fails if required variables are missing (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`).

## Scripts

| Script | Description |
|--------|-------------|
| `start` / `start:dev` / `start:prod` | Run API |
| `build` | Compile TypeScript |
| `lint` / `format` | ESLint / Prettier |
| `test` / `test:watch` / `test:cov` / `test:e2e` | Tests |
| `migration:generate` | Generate migration from entities |
| `migration:create` | Create empty migration |
| `migration:run` | Apply migrations |
| `migration:revert` | Revert last migration |
| `seed` | Load development seed data |

## Development seed credentials

**Never run `npm run seed` in production.** Seeds refuse to run when `NODE_ENV=production`.

| Role | Mobile | Password |
|------|--------|----------|
| Admin | `919999999999` | `Admin@12345` |
| Supplier | `919888888888` | `Supplier@12345` |

Seed also creates 3 customers, subscriptions, current-month deliveries, 1 issued bill, and 1 partial payment.

## Auth

- Mobile + password login
- Short-lived JWT access token
- Rotating hashed refresh tokens
- Role guards: `ADMIN`, `SUPPLIER`, `CUSTOMER`, `DELIVERY_PERSON`
- Auth endpoints are rate-limited

## Main endpoints

### Auth
- `POST /api/v1/auth/register/supplier`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET|PATCH /api/v1/auth/profile`
- `POST /api/v1/auth/change-password`

### Domain
- Customers: CRUD + pause/reactivate
- Subscriptions: CRUD + pause/resume/cancel (overlap validation)
- Deliveries: CRUD + `generate-daily-list` + `bulk-update`
- Bills: generate / finalize / void / pdf-data
- Payments: CRUD with bill balance recalculation
- Dashboard: supplier today/month, admin summary/growth/revenue
- Reports: deliveries, billing, payments, outstanding-balances
- Sync: `POST /sync/push`, `GET /sync/pull?cursor=`

## API conventions

Success:

```json
{ "data": {}, "meta": { "requestId": "uuid" } }
```

Paginated `meta` also includes `page`, `limit`, `total`, `totalPages`.

Errors:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": [],
  "requestId": "uuid",
  "timestamp": "ISO_DATE"
}
```

## Database

- TypeORM entities under `src/modules/*/entities`
- CLI datasource: `src/database/typeorm.datasource.ts`
- Initial migration: `src/database/migrations/1754490000000-InitialSchema.ts`
- `synchronize` is **never** enabled outside tests

## Deploy

- `Dockerfile` — multi-stage, non-root user
- `docker-compose.yml` — Postgres + API with healthchecks
- `render.yaml` — Render web service + Postgres blueprint

## CI

GitHub Actions (`.github/workflows/ci.yml`): install → lint → test → build.

## Security notes

- Passwords hashed with bcrypt; refresh tokens stored hashed
- `password_hash` never returned in API responses
- Helmet + CORS from env
- Supplier ownership enforced in services
- Billing/payment mutations use DB transactions
- Audit logs scrub passwords/tokens
# Dudh_wala_Backend

# PostgreSQL + Prisma Migration Audit

## Scope and Current State

- Backend data access is heavily coupled to Knex (`db(...)`) with **743 query call sites** in `backend/src`.
- Current database migrations are Knex + SQLite oriented (80 migrations).
- The codebase now has a Prisma baseline generated from the real migrated SQLite schema.

## What Was Implemented

### 1) Prisma schema baseline from the real app schema

- Created a SQLite introspection schema:
  - `backend/prisma/schema.sqlite.prisma`
- Ran introspection from a database with all 80 migrations applied.
- Generated a PostgreSQL Prisma schema:
  - `backend/prisma/schema.prisma`
- Result:
  - **84 Prisma models** (one backup table remains ignored by Prisma client as expected).

### 2) Runtime migration strategy selector

- Added `backend/scripts/run-db-migrations.js` and switched:
  - `npm run migrate:latest` now auto-selects:
    - **Postgres** -> `prisma db push + prisma generate`
    - **SQLite** -> legacy `knex migrate:latest`

### 3) Data copy utility (SQLite -> PostgreSQL)

- Added `backend/scripts/migrate-sqlite-to-postgres.js`
- Features:
  - reads all source SQLite tables
  - truncates matching PostgreSQL tables
  - bulk inserts in batches
  - optional FK-relax mode via `session_replication_role=replica` when permitted

### 4) Container stack switched to PostgreSQL

- Updated `docker-compose.yml`:
  - added `postgres` service
  - API now uses PostgreSQL `DATABASE_URL`
  - API startup runs `npm run migrate:latest`

### 5) Docker image updated for Prisma usage

- Updated `backend/Dockerfile`:
  - copies `prisma/` and `scripts/`
  - includes files needed to run Prisma migration commands in container

### 6) Deploy pipeline updated for Docker + PostgreSQL containers

- Updated `.github/scripts/deploy-production-remote.sh`:
  - starts `ultrazend-postgres`
  - starts `ultrazend-api` with PostgreSQL URL
  - keeps `npm run migrate:latest` (now Prisma-aware)

## Compatibility Findings (must be addressed progressively)

The app can now boot against PostgreSQL infrastructure, but there are SQL compatibility hotspots still requiring code refactor:

- SQL compatibility audit generated at:
  - `backend/postgres-sql-audit.json`
- SQLite/MySQL-specific SQL patterns currently found in source:
  - `strftime(...)`: **11**
  - `datetime('now', ...)`: **14**
  - `INSERT OR IGNORE`: **3**
  - `AUTOINCREMENT`: **27**
  - double-quoted string comparisons (`status = "sent"` style): **94**
  - `NOW() - INTERVAL 24 HOUR` style: **11**
- Prisma introspection fields not yet normalized:
  - `Unsupported("json")`: **72**
  - `Unsupported("time")`: **2**
  - `Unsupported("num")`: **9** (from ignored backup table)

## Recommended Next Refactor Wave

1. Replace SQLite date helpers (`strftime`, `datetime`) with PostgreSQL-compatible SQL (`date_trunc`, `extract`, `now() - interval ...`) in services/routes.
2. Normalize Prisma unsupported JSON fields to `Json` where safe.
3. Introduce a shared query helper for date/time aggregation so SQL dialect changes are centralized.
4. Gradually migrate high-traffic modules to Prisma client (start with auth, domains, emails read paths).

## Operational Commands

From `backend/`:

- PostgreSQL schema sync:
  - `npm run db:migrate:postgres`
- SQLite legacy migrations:
  - `npm run db:migrate:sqlite`
- SQLite -> PostgreSQL data copy:
  - `npm run db:copy:sqlite-to-postgres`

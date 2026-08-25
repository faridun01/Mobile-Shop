# Integration tests

These tests exercise the real Express API in `server/src/index.ts` against a real
PostgreSQL database — no mocks, no in-memory fakes. They prove behavior that a
pure unit test cannot: role-based access control, store-scope enforcement, and
cross-store data isolation as actually implemented by Express middleware and
Prisma queries.

## Running locally

1. A Postgres instance reachable via `DATABASE_URL` in `.env`, migrated and seeded:
   ```
   npx prisma migrate deploy
   npx tsx prisma/seed.ts
   ```
2. Start the API server:
   ```
   npx tsx server/src/index.ts
   ```
3. Run the suite (defaults to `http://localhost:3002`, override with `API_BASE_URL`):
   ```
   npx vitest run tests/integration
   ```

If the server isn't reachable, the suite logs a warning and skips itself rather
than failing noisily — useful when running `npm test` without the backend up.

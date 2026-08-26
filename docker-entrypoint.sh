#!/bin/sh
set -e

echo "Applying Prisma migrations..."
MIGRATE_URL="${DIRECT_URL:-$DATABASE_URL}"

if [ -n "$MIGRATE_URL" ]; then
  DATABASE_URL="$MIGRATE_URL" ./node_modules/.bin/prisma migrate deploy || {
    echo "Warning: First migration attempt failed. Retrying in 3 seconds..."
    sleep 3
    DATABASE_URL="$MIGRATE_URL" ./node_modules/.bin/prisma migrate deploy || {
      echo "Warning: Prisma migration failed (likely due to Supabase connection pool limits). Proceeding to start application..."
    }
  }
fi

echo "Starting Application..."
exec ./node_modules/.bin/tsx server/src/index.ts

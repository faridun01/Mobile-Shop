#!/bin/sh
set -e

echo "Applying Prisma migrations..."
MIGRATE_URL="${DIRECT_URL:-$DATABASE_URL}"

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL must be set." >&2
  exit 1
fi

if [ -n "$MIGRATE_URL" ]; then
  DATABASE_URL="$MIGRATE_URL" ./node_modules/.bin/prisma migrate deploy || {
    echo "Warning: First migration attempt failed. Retrying in 3 seconds..."
    sleep 3
    DATABASE_URL="$MIGRATE_URL" ./node_modules/.bin/prisma migrate deploy || {
      echo "Error: Prisma migrations failed twice. Application startup aborted." >&2
      exit 1
    }
  }
fi

echo "Starting Application..."
exec ./node_modules/.bin/tsx server/src/index.ts

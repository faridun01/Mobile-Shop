#!/bin/sh
set -e

echo "Applying Prisma migrations..."
if [ -n "$DIRECT_URL" ]; then
  echo "Using DIRECT_URL for Prisma migrations..."
  DATABASE_URL="$DIRECT_URL" ./node_modules/.bin/prisma migrate deploy
else
  echo "Using DATABASE_URL for Prisma migrations..."
  ./node_modules/.bin/prisma migrate deploy
fi

echo "Starting Application..."
exec ./node_modules/.bin/tsx server/src/index.ts

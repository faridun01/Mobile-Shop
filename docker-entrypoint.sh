#!/bin/sh
set -e

echo "Applying Prisma migrations..."
if [ -n "$DIRECT_URL" ]; then
  DATABASE_URL="$DIRECT_URL" ./node_modules/.bin/prisma migrate deploy || ./node_modules/.bin/prisma migrate deploy
else
  ./node_modules/.bin/prisma migrate deploy
fi

echo "Starting Application..."
exec ./node_modules/.bin/tsx server/src/index.ts

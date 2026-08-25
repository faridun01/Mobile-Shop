#!/bin/sh
set -e

echo "Applying Prisma migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Starting Application..."
exec ./node_modules/.bin/tsx server/src/index.ts

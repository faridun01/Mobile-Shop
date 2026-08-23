#!/bin/sh
set -e

echo "Running Prisma Database Sync..."
npx prisma db push --skip-generate || echo "Prisma db push warning"

echo "Starting Application..."
exec npm run server

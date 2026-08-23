#!/bin/sh
set -e

echo "Running Prisma Database Sync..."
npx prisma db push --accept-data-loss || echo "Prisma db push warning"

echo "Starting Application..."
exec npm run preview

#!/bin/sh
set -e

echo "==> Starting container entrypoint..."

# Apply database migrations if DATABASE_URL is configured
if [ -n "$DATABASE_URL" ]; then
  echo "==> Applying Prisma migrations (prisma migrate deploy)..."
  npx prisma migrate deploy

  echo "==> Ensuring initial database seed (games, draws, settings, admin)..."
  if [ -f "backend/dist/seed.js" ]; then
    node backend/dist/seed.js || echo "==> [Warning] Seed failed or already completed."
  fi
fi

echo "==> Launching server process: $@"
exec "$@"

#!/bin/sh
set -e

echo "==> Starting container entrypoint..."

# Apply database migrations if DATABASE_URL is configured
if [ -n "$DATABASE_URL" ]; then
  echo "==> Applying Prisma migrations (prisma migrate deploy)..."
  # Prisma migrations need session-level advisory locks. Use a direct Neon
  # connection for migrations; keep the app's DATABASE_URL pooled at runtime.
  migration_database_url="$(node -e '
    const explicit = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_URL;
    const url = new URL(explicit || process.env.DATABASE_URL);
    if (!explicit && url.hostname.endsWith(".neon.tech")) {
      url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
      url.searchParams.delete("pgbouncer");
    }
    process.stdout.write(url.toString());
  ')"
  DATABASE_URL="$migration_database_url" npx prisma migrate deploy

  echo "==> Ensuring initial database seed (games, draws, settings, admin)..."
  if [ -f "backend/dist/seed.js" ]; then
    node backend/dist/seed.js || echo "==> [Warning] Seed failed or already completed."
  fi
fi

echo "==> Launching server process: $@"
exec "$@"

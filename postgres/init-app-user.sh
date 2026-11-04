#!/bin/bash
set -e

# =============================================================================
# IntelBriefs - Least-Privilege Application User
# =============================================================================
#
# Creates a dedicated 'intelbriefs_app' PostgreSQL role with DML-only privileges.
# This script runs ONCE on first database initialization (empty data volume).
#
# Privileges granted:
#   - CONNECT to intelbriefs_db database
#   - USAGE on public schema
#   - SELECT, INSERT, UPDATE, DELETE on all tables (current + future)
#   - USAGE, SELECT on all sequences (current + future)
#
# NOT granted (reserved for superuser / Prisma migrations):
#   - CREATE / DROP tables
#   - ALTER tables
#   - TRUNCATE
#   - Any DDL operations
#
# Usage:
#   Mounted into postgres container at /docker-entrypoint-initdb.d/02-init-app-user.sh
#   Password sourced from INTELBRIEFS_APP_PASSWORD environment variable.
# =============================================================================

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'intelbriefs_app') THEN
      CREATE ROLE intelbriefs_app WITH LOGIN PASSWORD '${INTELBRIEFS_APP_PASSWORD}';
      RAISE NOTICE 'Created role intelbriefs_app';
    ELSE
      RAISE NOTICE 'Role intelbriefs_app already exists, skipping creation';
    END IF;
  END
  \$\$;

  -- Connect privilege
  GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO intelbriefs_app;

  -- Schema usage
  GRANT USAGE ON SCHEMA public TO intelbriefs_app;

  -- DML on existing tables and sequences
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO intelbriefs_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO intelbriefs_app;

  -- DML on future tables and sequences (created by Prisma migrations)
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO intelbriefs_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO intelbriefs_app;
EOSQL

echo "=== intelbriefs_app user created with least-privilege DML access ==="

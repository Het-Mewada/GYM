#!/bin/bash
set -e

APP_PW="${APP_USER_PASSWORD:-dev_app_password_only}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'definer_admin') THEN
      CREATE ROLE definer_admin WITH NOLOGIN BYPASSRLS;
    ELSE
      ALTER ROLE definer_admin WITH NOLOGIN BYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
      CREATE ROLE app_user WITH LOGIN PASSWORD '$APP_PW' NOBYPASSRLS;
    ELSE
      ALTER ROLE app_user WITH PASSWORD '$APP_PW' NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'retention_worker') THEN
      CREATE ROLE retention_worker WITH LOGIN PASSWORD 'dev_retention_password_only' NOBYPASSRLS;
    ELSE
      ALTER ROLE retention_worker WITH NOBYPASSRLS;
    END IF;
  END \$\$;

  CREATE EXTENSION IF NOT EXISTS "pg_trgm";
  CREATE EXTENSION IF NOT EXISTS "btree_gist";
EOSQL

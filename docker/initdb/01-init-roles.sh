#!/bin/bash
set -e

APP_PW="${APP_USER_PASSWORD:-app_user_dev_password}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
      CREATE ROLE app_user WITH LOGIN PASSWORD '$APP_PW' NOBYPASSRLS;
    ELSE
      ALTER ROLE app_user WITH PASSWORD '$APP_PW' NOBYPASSRLS;
    END IF;
  END \$\$;

  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOSQL

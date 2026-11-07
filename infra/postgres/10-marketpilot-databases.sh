#!/bin/sh
set -eu
: "${MARKETPILOT_DB_PASSWORD:?MARKETPILOT_DB_PASSWORD is required}"
: "${N8N_DB_PASSWORD:?N8N_DB_PASSWORD is required}"
# psql variables and format(%I/%L) quote role names and passwords safely.
psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 \
  --set app_password="$MARKETPILOT_DB_PASSWORD" --set n8n_password="$N8N_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', 'marketpilot_app', :'app_password') \gexec
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', 'marketpilot_n8n', :'n8n_password') \gexec
CREATE DATABASE marketpilot OWNER marketpilot_app;
CREATE DATABASE marketpilot_n8n OWNER marketpilot_n8n;
REVOKE CONNECT, TEMPORARY ON DATABASE marketpilot FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE marketpilot_n8n FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE marketpilot TO marketpilot_app;
GRANT CONNECT, TEMPORARY ON DATABASE marketpilot_n8n TO marketpilot_n8n;
SQL
psql --username "$POSTGRES_USER" --dbname marketpilot --set ON_ERROR_STOP=1 <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
psql --username "$POSTGRES_USER" --dbname marketpilot_n8n --set ON_ERROR_STOP=1 <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL

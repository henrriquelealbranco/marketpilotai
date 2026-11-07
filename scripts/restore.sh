#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ $# != 2 || "$1" != --confirm-marketpilot-restore ]]; then
  echo 'Usage: restore.sh --confirm-marketpilot-restore /absolute/path/marketpilot-YYYYMMDDTHHMMSSZ.dump' >&2
  exit 1
fi
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
env_file="${MARKETPILOT_ENV_FILE:-$repo_root/.env.production}"
project="${MARKETPILOT_PROJECT_NAME:-marketpilot}"
input="$2"
[[ "$project" =~ ^marketpilot(-[a-z0-9][a-z0-9-]*)?$ ]] || { echo 'Invalid MarketPilot project name' >&2; exit 1; }
[[ "$input" = /* && -f "$input" && ! -L "$input" ]] || { echo 'Input must be an absolute regular dump file, not a symlink' >&2; exit 1; }
name="$(basename -- "$input")"
[[ "$name" =~ ^marketpilot-[0-9]{8}T[0-9]{6}Z\.dump$ ]] || { echo 'Input is not a MarketPilot backup filename' >&2; exit 1; }
[[ -f "$env_file" && -f "$input.sha256" && ! -L "$input.sha256" ]] || { echo 'Production env file and checksum are required' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker is required' >&2; exit 1; }
# Verify exactly this dump; never allow a checksum file to reference other paths.
read -r expected_hash checksum_name < "$input.sha256"
[[ "$expected_hash" =~ ^[a-fA-F0-9]{64}$ && "$checksum_name" == "$name" ]] || { echo 'Invalid checksum record' >&2; exit 1; }
actual_hash="$(sha256sum -- "$input")"; actual_hash="${actual_hash%% *}"
[[ "${expected_hash,,}" == "${actual_hash,,}" ]] || { echo 'Backup checksum does not match' >&2; exit 1; }
compose=(docker compose --project-name "$project" --env-file "$env_file" -f "$repo_root/compose.production.yaml")
"${compose[@]}" exec -T marketpilot-postgres pg_restore --list < "$input" > /dev/null
"${compose[@]}" stop marketpilot-web marketpilot-worker marketpilot-api marketpilot-n8n
"${compose[@]}" exec -T marketpilot-postgres sh -ec 'PGPASSWORD="$MARKETPILOT_DB_PASSWORD" exec pg_restore --host=127.0.0.1 --username=marketpilot_app --dbname=marketpilot --clean --if-exists --exit-on-error --single-transaction --no-owner --no-acl' < "$input"
echo 'Restored only the MarketPilot application database. Services remain stopped; apply migrations and verify before starting them.'

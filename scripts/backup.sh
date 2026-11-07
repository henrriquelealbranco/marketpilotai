#!/usr/bin/env bash
set -euo pipefail
umask 077
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
backup_root="${MARKETPILOT_BACKUP_ROOT:-$repo_root/.backups/marketpilot}"
env_file="${MARKETPILOT_ENV_FILE:-$repo_root/.env.production}"
project="${MARKETPILOT_PROJECT_NAME:-marketpilot}"
retention_days="${MARKETPILOT_BACKUP_RETENTION_DAYS:-14}"
[[ "$project" =~ ^marketpilot(-[a-z0-9][a-z0-9-]*)?$ ]] || { echo 'Project must be marketpilot or marketpilot-<environment>' >&2; exit 1; }
[[ "$retention_days" =~ ^[0-9]+$ ]] && ((retention_days >= 7 && retention_days <= 365)) || { echo 'Retention must be 7–365 days' >&2; exit 1; }
[[ "$backup_root" = /* && "$backup_root" != / && ! -L "$backup_root" ]] || { echo 'Backup root must be an absolute non-root directory, not a symlink' >&2; exit 1; }
[[ -f "$env_file" ]] || { echo 'Production env file not found' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker is required' >&2; exit 1; }
mkdir -p -- "$backup_root"
backup_root="$(cd -- "$backup_root" && pwd -P)"
[[ "$backup_root" != / && "$backup_root" != "$repo_root" ]] || { echo 'Unsafe backup directory' >&2; exit 1; }
compose=(docker compose --project-name "$project" --env-file "$env_file" -f "$repo_root/compose.production.yaml")
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_root/marketpilot-$stamp.dump"
temporary="$target.partial"
[[ ! -e "$target" && ! -e "$temporary" ]] || { echo 'Backup path already exists' >&2; exit 1; }
trap 'rm -f -- "$temporary"' EXIT
"${compose[@]}" exec -T marketpilot-postgres sh -ec 'PGPASSWORD="$MARKETPILOT_DB_PASSWORD" exec pg_dump --host=127.0.0.1 --username=marketpilot_app --dbname=marketpilot --format=custom --no-owner --no-acl' > "$temporary"
[[ -s "$temporary" ]] || { echo 'Backup is empty' >&2; exit 1; }
"${compose[@]}" exec -T marketpilot-postgres pg_restore --list < "$temporary" > /dev/null
mv -- "$temporary" "$target"
(cd -- "$backup_root" && sha256sum -- "$(basename -- "$target")" > "$(basename -- "$target").sha256")
# Retention removes only this script's exact file pattern directly under the chosen root.
while IFS= read -r -d '' candidate; do
  name="$(basename -- "$candidate")"
  if [[ "$name" =~ ^marketpilot-[0-9]{8}T[0-9]{6}Z\.dump$ ]]; then
    rm -f -- "$candidate" "$candidate.sha256"
  fi
done < <(find "$backup_root" -maxdepth 1 -type f -name 'marketpilot-*.dump' -mtime "+$retention_days" -print0)
printf 'Validated backup: %s\n' "$target"

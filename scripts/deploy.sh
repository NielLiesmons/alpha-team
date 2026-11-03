#!/usr/bin/env bash
# Safe static deploy for Alpha Admin → /var/www/admin
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-37.27.152.36}"
USER="${DEPLOY_USER:-deploy}"
PATH_REMOTE="${DEPLOY_PATH:-/var/www/admin}"
KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/alpha-deploy}"
APEX="${DEPLOY_APEX:-}"

cd "$ROOT"

if [[ ! -d build ]] || [[ "${FORCE_BUILD:-0}" == "1" ]]; then
	echo "==> build"
	npm run build
fi

echo "==> ensure remote dir"
ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
	"${USER}@${HOST}" "mkdir -p '${PATH_REMOTE}'"

echo "==> rsync → ${USER}@${HOST}:${PATH_REMOTE}/"
rsync -az --delete \
	-e "ssh -i ${KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes" \
	./build/ \
	"${USER}@${HOST}:${PATH_REMOTE}/"

if [[ -n "$APEX" ]]; then
	echo "==> live at https://admin.${APEX} (${PATH_REMOTE})"
else
	echo "==> deployed to ${PATH_REMOTE} (set DEPLOY_APEX to print the public URL)"
fi

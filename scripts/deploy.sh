#!/usr/bin/env bash
# Safe static deploy for Alpha Admin → /var/www/admin
# Public host is team.{apex} (legacy admin.{apex} redirects there).
#
# Required: DEPLOY_HOST (hostname or IP of the deploy target).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:?Set DEPLOY_HOST to the deploy target hostname or IP}"
USER="${DEPLOY_USER:-deploy}"
PATH_REMOTE="${DEPLOY_PATH:-/var/www/admin}"

if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
	KEY="$DEPLOY_SSH_KEY"
elif [[ -f "$HOME/.ssh/alpha-deploy" ]]; then
	KEY="$HOME/.ssh/alpha-deploy"
elif [[ -f "$HOME/.ssh/bley-deploy" ]]; then
	# Legacy key name still accepted if present locally.
	KEY="$HOME/.ssh/bley-deploy"
else
	KEY="$HOME/.ssh/alpha-deploy"
fi

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
# Protect hashed bundles from --delete. Stale service workers keep serving the
# previous HTML shell for a while; if those chunks are gone, installed PWAs blank.
# New files still upload; obsolete non-immutable paths are removed as usual.
rsync -az --delete \
	--filter='P /_app/immutable/***' \
	-e "ssh -i ${KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes" \
	./build/ \
	"${USER}@${HOST}:${PATH_REMOTE}/"

if [[ -n "$APEX" ]]; then
	echo "==> live at https://team.${APEX} (${PATH_REMOTE})"
else
	echo "==> deployed to ${PATH_REMOTE} (set DEPLOY_APEX to print the public URL)"
fi

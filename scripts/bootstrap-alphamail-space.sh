#!/usr/bin/env bash
# One-shot VPS bootstrap for the alphamail.xyz Space (root).
# Parallel to nielliesmons: separate Drive ciphertext store + API + Caddy hosts.
# Does NOT copy bley tokens or root keys. ROOT cipher key stays on devices only.
#
# Usage (from laptop):
#   scp -i ~/.ssh/alpha-deploy deploy/Caddyfile.team.alphamail.xyz \
#       deploy/services/alpha-drive-alphamail.service \
#       deploy/services/alpha-api-alphamail.service \
#       scripts/bootstrap-alphamail-space.sh \
#       root@$DEPLOY_HOST:/tmp/
#   ssh -i ~/.ssh/alpha-deploy root@$DEPLOY_HOST bash /tmp/bootstrap-alphamail-space.sh
set -euo pipefail

APEX=alphamail.xyz
DRIVE_PORT=8807
API_PORT=8808
DRIVE_DATA=/mnt/storage/alpha-drive-alphamail
API_DATA=/opt/alpha-api-alphamail/data
DRIVE_ENV=/etc/alpha-drive/alphamail.env
API_ENV=/etc/alpha-api/alphamail.env

if [[ "$(id -u)" -ne 0 ]]; then
	echo "run as root" >&2
	exit 1
fi

mkdir -p /etc/alpha-drive /etc/alpha-api "$DRIVE_DATA" "$API_DATA" /opt/alpha-api-alphamail
chmod 700 /etc/alpha-drive /etc/alpha-api

if [[ ! -f "$DRIVE_ENV" ]]; then
	umask 077
	printf 'ALPHA_DRIVE_TOKEN=%s\n' "$(openssl rand -hex 32)" >"$DRIVE_ENV"
	chmod 600 "$DRIVE_ENV"
	echo "wrote $DRIVE_ENV (new bearer — not a root key)"
else
	echo "keep existing $DRIVE_ENV"
fi

if [[ ! -f "$API_ENV" ]]; then
	umask 077
	printf 'ALPHA_API_ADMIN_TOKEN=%s\n' "$(openssl rand -hex 32)" >"$API_ENV"
	chmod 600 "$API_ENV"
	echo "wrote $API_ENV (new pubs admin token)"
else
	echo "keep existing $API_ENV"
fi

install -m 644 /tmp/alpha-drive-alphamail.service /etc/systemd/system/alpha-drive-alphamail.service
install -m 644 /tmp/alpha-api-alphamail.service /etc/systemd/system/alpha-api-alphamail.service

# Replace / extend alphamail team block with full space snippet when present.
if [[ -f /tmp/Caddyfile.team.alphamail.xyz ]]; then
	cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)"
	# Drop any prior alphamail product blocks (keep marketing apex/www).
	python3 - <<'PY'
from pathlib import Path
path = Path("/etc/caddy/Caddyfile")
text = path.read_text()
markers = (
	"drive.alphamail.xyz {",
	"mail.alphamail.xyz {",
	"api.alphamail.xyz {",
	"team.alphamail.xyz {",
	"admin.alphamail.xyz {",
)
lines = text.splitlines(keepends=True)
out = []
i = 0
while i < len(lines):
	line = lines[i]
	stripped = line.lstrip()
	if any(stripped.startswith(m) for m in markers):
		depth = 0
		while i < len(lines):
			depth += lines[i].count("{") - lines[i].count("}")
			i += 1
			if depth <= 0:
				# skip trailing blank
				if i < len(lines) and lines[i].strip() == "":
					i += 1
				break
		continue
	out.append(line)
	i += 1
snippet = Path("/tmp/Caddyfile.team.alphamail.xyz").read_text().rstrip() + "\n\n"
# Insert after marketing alphamail.xyz block if present, else append.
joined = "".join(out)
needle = "alphamail.xyz {\n"
# Find marketing apex block end — rough: after first alphamail.xyz { that is not www.
idx = joined.find("\nalphamail.xyz {")
if idx < 0:
	idx = joined.find("alphamail.xyz {")
if idx >= 0:
	# walk to matching close
	start = idx if joined[idx] != "\n" else idx + 1
	depth = 0
	j = start
	while j < len(joined):
		if joined[j] == "{":
			depth += 1
		elif joined[j] == "}":
			depth -= 1
			if depth == 0:
				j += 1
				break
		j += 1
	while j < len(joined) and joined[j] in "\r\n":
		j += 1
	joined = joined[:j] + "\n" + snippet + joined[j:]
else:
	joined = joined.rstrip() + "\n\n" + snippet
path.write_text(joined)
print("merged Caddyfile.team.alphamail.xyz")
PY
fi

systemctl daemon-reload
systemctl enable --now alpha-drive-alphamail.service alpha-api-alphamail.service
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> local health"
curl -sf "http://127.0.0.1:${DRIVE_PORT}/health" && echo " drive ok"
curl -sf "http://127.0.0.1:${API_PORT}/health" && echo " api ok"
echo "==> public (after TLS)"
curl -sfI "https://drive.${APEX}/health" | head -3 || true
curl -sfI "https://api.${APEX}/health" | head -3 || true
curl -sfI "https://team.${APEX}/" | head -3 || true
echo "done — device ROOT key is NOT on this server; generate with alpha-drive keygen on a trusted device"

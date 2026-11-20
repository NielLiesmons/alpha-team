# Alpha Admin

Operator dashboard for a **Space** (team / family / SMB). Hostname picks the apex (`team.{apex}`; legacy `admin.{apex}` redirects).

## What it is

- Drive client — browser encrypt/decrypt against `drive.{apex}` (session shared with Player via `Domain=.{apex}` cookies).
- **Player** — standalone app at `player.{apex}` (not embedded in Admin).
- Mail via same-origin `/jmap` proxy to Stalwart on `mail.{apex}`.
- Public content API client → `api.{apex}` (project slug derived from apex or `PUBLIC_ALPHA_PROJECT`).

Product direction (feature modules, multi-Space): see [ADR-alpha-spaces-product](../alpha-docs/ADR-alpha-spaces-product.md).

## Env (optional overrides)

| Variable | Purpose |
|----------|---------|
| `PUBLIC_ALPHA_API_URL` | API origin |
| `PUBLIC_ALPHA_PROJECT` | `projects/{slug}` on the API |
| `PUBLIC_MAIL_DOMAIN` | Invite mailbox domain |
| `PUBLIC_PLAYER_URL` | Player redirect |
| `PUBLIC_MAIL_URL` | Mail origin (JMAP client fallback) |
| `ALPHA_JMAP_PROXY` | Vite dev proxy target for `/jmap` |

## Deploy

Static build → rsync to the Admin host. Prefer GitHub Actions on `main`.

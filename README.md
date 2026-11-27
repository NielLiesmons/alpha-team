# Alpha Admin

Operator UI for an Alpha **Space** (team / family / SMB): Chat, Mail, Files, Tasks, Notes, Websites.

Alpha = private Drive + Mail + Chat on your domain — open protocols, self-hostable where it matters.

## Stack

| Layer | Tech |
|-------|------|
| App | SvelteKit (static adapter) + Vite |
| UI | `@alpha/ui` (tokens, shell, sheets, icons) — vendored or `file:` |
| Private data | **alpha-drive** — browser encrypt/decrypt; server holds ciphertext only |
| Public content | **alpha-api** — posts, RSS, audiences, campaigns |
| Mail | Stalwart JMAP via same-origin `/jmap` proxy → `mail.{apex}` |
| Realtime | WebSocket bus on alpha-api (`/v1/realtime`) for chat tips / ephemeral |
| Auth | Drive session cookie on `.{apex}` (shared with Player) |

Hostname → apex: `team.{apex}` (legacy `admin.{apex}` redirects).

## Layout (agents)

```
src/lib/
  drive/          # cryptree client, entities, tips
  chat*.js        # tip mailbox + realtime wake
  mail*.js        # JMAP + thread model
  components/     # AppShell, DetailColumn, feeds
routes/           # product surfaces (chat, mail, files, …)
```

Design rules: sibling `alpha-docs/ADR-shared-design-system.md` and `.cursor/rules/alpha-design-system.mdc`.

## Env (optional)

| Variable | Purpose |
|----------|---------|
| `PUBLIC_ALPHA_API_URL` | API origin |
| `PUBLIC_ALPHA_PROJECT` | API project slug |
| `PUBLIC_MAIL_DOMAIN` | Invite mailbox domain |
| `PUBLIC_PLAYER_URL` | Player deep-link |
| `ALPHA_JMAP_PROXY` | Vite `/jmap` proxy target |

Deploy secrets (CI): `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`. Never commit tokens or VPS IPs.

## Local

```bash
npm install
npm run dev
```

## Deploy

Static build → rsync. Prefer GitHub Actions on `main`. Manual:

```bash
DEPLOY_HOST=your.vps.example ./scripts/deploy.sh
```

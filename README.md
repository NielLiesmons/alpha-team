# Alpha Admin

One dashboard for every customer space. This build is **UI only**: Bley sample data, nothing saved, nothing sent.

Host: `admin.bley.farm` (same VPS as the public site). Hostname picks the space later; the public farm site stays in `bley`.

## Run

```bash
cd ~/Nextcloud/Documents/Projects/Buffalo/Alpha/alpha-admin
bun install
bun run dev
```

Open the URL Vite prints (port 5174 when it is free).

## Deploy

Push to `main` runs GitHub Actions → `bun run build` → rsync to `/var/www/admin` on the VPS.

DNS: `admin` **A** → same IP as `bley.farm` / `drive.bley.farm`. Caddy serves the static build and issues TLS once the name resolves.

## Screens

| Route | What you can click |
|---|---|
| `/drive` | Folders under `public/` and `private/`, file preview |
| `/mail` | Subscriber list, mark a published post as sent |
| `/news` | Edit a publication, create one, publish or unpublish |
| `/chat`, `/projects`, `/tasks`, `/accounting` | Section shells. Emoji slot is empty where no Zapstore sticker fits yet |
| `/settings` | Light, gray, dark, or system appearance |

Section stickers live in `static/emoji/`. Point a section at one from `src/lib/sections.js`. Leave `emoji: null` to keep the slot empty.

Changes last for the browser tab only.

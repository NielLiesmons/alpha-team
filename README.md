# Alpha Admin

Operator dashboard for a customer Space. Hostname picks the space (`admin.bley.farm`).

Public farm site stays in `bley`.

## Status

- **Tasks** — real UI; demo fixtures until Settings → Drive connect.
- Drive client — browser encrypt/decrypt against `drive.bley.farm` (root key in localStorage only).
- Everything else in the sidebar — empty stubs.
- Settings — Drive credentials + appearance + brand knobs.
- Nav — line icons (placeholders); no emoji stickers.

## Run

```bash
bun install
bun run dev
```

## Sidebar IA

Drive · Mail · Chat · Publications · Projects · Tasks · Notes · Calendar  
(+ Settings in the footer)

## Drive model

See `../alpha-docs/DRIVE-LAYOUT.md`: content-type folders + project **labels** (multi-label), not “one project folder only.”

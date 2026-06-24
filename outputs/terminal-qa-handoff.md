# Handoff: visual QA of the "Terminal" theme

You are a fresh agent with no prior context. Your job: **run the `shared-contacts`
web UI and visually verify the new "Terminal" theme** across every screen, palette,
and mode, then report what's broken or off. Do NOT change product behavior; this is
a visual/UX audit. Small visual fixes are OK if you find clear regressions, but
verify first and keep them token-only.

## 1. Background (what the theme is)

The app was re-skinned into "The Terminal": JetBrains Mono everywhere,
phosphor-on-near-black, sharp corners, hairline borders, **no drop shadows**. There
is a **phosphor palette switcher** in the sidebar footer that rotates
`green -> amber -> cyan -> multi` (persisted in `localStorage('phosphor')`, applied
via `data-phosphor` on `<html>`). There is also a light/dark theme toggle; dark is
default, light is a "paper terminal" variant.

**Read first** (these are the spec):

- `ui/design-language.md` - principles (voice, density, color-as-signal, signatures).
- `ui/design-system.md` - tokens, the `data-phosphor` mechanism, signature patterns.

Signature elements to expect: `shared·contacts` brand; `~/contacts` `~/books`
`~/help` nav paths; a `❯` command-bar prompt on the contacts search; an always-on
status line (`N / N contacts · ↑↓ navigate · ⏎ open · ⌫ delete`); `›` carets on row
hover; bracketed `[ tags ]` badges; a `:w save · esc cancel` command footer on the
editor.

## 2. Run the app

Prereq: Node 22+, Docker (for Postgres). The app needs Postgres with sample data.

**Option A - full docker (self-contained):**

```bash
docker compose up -d --build      # builds UI (now uses bcryptjs), Postgres, radicale, sync
# wait for healthy, then open http://localhost:3030
```

Migrations auto-run including sample contacts (16 contacts, 3 books: "Private Book 1",
"Public Book 2" read-only, "Shared Contacts"). Confirm `curl -s -o /dev/null -w '%{http_code}' localhost:3030/` returns 200.

**Option B - host dev (faster reload):** run Postgres in docker but publish its port,
point the UI at it, and run vite on the host:

```bash
docker compose -f docker-compose.yml -f /tmp/sc-pgport.yml up -d postgres   # publishes 5433 (or add a ports: ["5433:5432"] override)
# ui/.env.local:  DATABASE_URL=postgresql://sharedcontacts:sharedcontacts@localhost:5433/sharedcontacts
cd ui && npm install && npm run dev    # http://localhost:3030
```

Use the preview/browser tooling to screenshot. Check the browser console for errors
on each screen (ignore stale vite HMR "Failed to reload" lines from prior edits;
judge by a clean reload).

## 3. What to check - screen matrix

For EACH route, confirm: mono font + phosphor palette applied; no raw zinc/blue/etc.
colors; sharp corners; no drop shadows; readable contrast; the page is full-width;
`PageHeader` title + description present; primary action is the phosphor color; no
layout overflow; long values (emails, slugs, URLs) wrap/truncate, don't break layout.

| Route                          | Verified before? | Watch for                                                                                                                |
| ------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/` contacts list              | yes              | `❯` command bar, status line, hover `›` caret, filter chips, avatars                                                     |
| `/$id` contact editor          | yes              | tabs + Cancel/Save in HEADER (aligned w/ breadcrumb), columns level, tight card padding, `:w save` footer, delete dialog |
| `/new` create                  | yes              | same two-column editor, `:w create` footer, Create posts then routes to `/$id`                                           |
| `/books`                       | yes              | bracketed `[ Public ]/[ Private ]/[ Yes ]/[ No ]` badges, mono slugs                                                     |
| `/history`                     | yes              | op badges neutral/phosphor (not blue/orange), diff red/green pairs, address-book diffs show NAMES not JSON, full-width   |
| `/trash`                       | **NO**           | table density, restore/permanent-delete confirm dialogs                                                                  |
| `/duplicates`                  | **NO**           | empty + populated states, merge confirm                                                                                  |
| `/import`                      | **NO**           | CSV dropzone styling, toasts                                                                                             |
| `/carddav-connection`          | **NO**           | mono URLs + copy buttons, accordions, destructive security callout, font-mono machine values                             |
| `/radicale-users` (Book Users) | **NO**           | backfill explainer block, empty state, create/delete dialogs                                                             |
| `/help`, `/about`              | **NO**           | Card density (just tightened app-wide), mono version values                                                              |

## 4. Cross-cutting passes

- **Palettes:** rotate the sidebar toggle through green / amber / cyan / multi on at
  least the list, editor, books, and history. EVERY color must hold in all four (if
  something only looks right in green, it's using a non-token color - a bug). `multi`
  = green base with amber accents + red destructive.
- **Light mode:** flip the theme toggle (sun/moon, sidebar footer). The "paper
  terminal" light variant is defined but only lightly tested - scrutinize contrast
  and any element that looks unstyled/inverted.
- **Mobile/responsive:** resize to ~375px. The editor header now packs breadcrumb +
  tabs + Cancel/Save - confirm it wraps sanely. Check the mobile header/sidebar
  drawer, tables (horizontal scroll or stacked), and the two-column editor collapsing
  to one column.

## 5. Report format

For each finding: route + palette/mode, what's wrong, a screenshot, and severity
(broken / off / nit). Group by severity. Call out explicitly anything using a raw
(non-token) color, a drop shadow, or a soft radius, since those break the terminal
language. If a screen is clean in all palettes + modes, say so - "no issues" is a
valid, useful result.

## 6. Guardrails

- Behavior/contracts stay stable; do not touch `routes/api/**`, `lib/**` behavior,
  Docker/env. Token-only color fixes; reuse `components/ui/**` primitives.
- Verify gate before reporting any fix: from `ui/` run tsc/lint/test, from root
  `npm run format:check` (see `outputs/next-steps.md` for exact commands; 1 lint
  warning in `mobileconfig.test.ts` is pre-existing).

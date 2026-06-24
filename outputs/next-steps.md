# next-steps — shared-contacts UI — 2026-06-23

State of the UI redesign effort. All work is landed on **local `main`** (not yet
pushed to `origin/main`).

## What happened (in order)

1. **Cycle 1 - design unification (zinc/shadcn).** Built a shared design system
   (`PageHeader`, `PageContainer`, `ConfirmDialog`, `Badge`) and aligned all 11
   flows onto it (tokens, no `window.confirm`/`alert`, ported `/new` onto the
   two-column editor, deleted the then-dead `ContactForm.tsx`).
2. **bcrypt/musl fix.** Replaced native `bcrypt` with `bcryptjs` so the dockerized
   UI stops 500ing under Alpine. `docker compose up` now serves HTTP 200.
3. **Cycle 2 - "Terminal" visual identity (CURRENT).** After HTML design
   exploration the user chose direction **B, The Terminal**, applied across the
   whole app: JetBrains Mono everywhere, phosphor-on-near-black tokens, sharp
   radius, command bar + status line + `~/` nav + hover carets + command
   footers + bracketed badges. Added a **phosphor palette switcher**
   (green/amber/cyan/multi via `data-phosphor`, sidebar `PhosphorToggle`). Pages
   are full-width; history diffs render readable labels (not raw JSON); op badges
   tokenized; editor tabs/actions moved into the header; `Card` density tightened;
   font self-hosted via `@fontsource/jetbrains-mono`; dead `ContactCard.tsx`
   removed.

## Source of truth

- **Design docs:** `ui/design-language.md` + `ui/design-system.md` (rewritten for
  Terminal; describe tokens, the `data-phosphor` mechanism, and signature
  patterns). Read these before touching UI.

## Discovered facts

- STACK: TanStack Start (React 19), Vite 7 / Nitro, app in `ui/`. Tailwind v4
  (CSS-first, tokens in `ui/src/styles.css`), shadcn primitives in
  `ui/src/components/ui/`, lucide icons.
- VERIFY (from `ui/`): `npx tsc --noEmit -p tsconfig.build.json`, `npm run lint`,
  `npm run test:unit`; from repo ROOT `npm run format:check`. Optional:
  `npm run build` (validates the font `@import`). Lint has 1 PRE-EXISTING warning
  (`routes/api/mobileconfig.test.ts:16` require-await) - not ours.
- DO-NOT-TOUCH: `ui/src/routes/api/**`, `ui/src/lib/**` behavior, `sync-service/`,
  `radicale/`, `migrations/`, Docker/compose/env. Prod topology cloudflared ->
  `https://traefik:443`.

## Status

- [DONE] terminal theme across all screens (token-driven), gate GREEN, prod build GREEN.
- [DONE] phosphor switcher (green/amber/cyan/multi), self-hosted font, full-width
  pages, readable history diffs, tokenized op badges, editor header layout, denser
  cards, dead-code removal.
- [TODO] **PUSH**: local `main` is ahead of `origin/main`. Blocked for the agent by
  a `Bash(git push*)` deny rule - the user must `git push origin main` (or open a PR).
- [TODO] **Visual QA sweep** of the new theme - see `outputs/terminal-qa-handoff.md`.
  Verified so far: contacts list, `$id` editor, `/new`, books, history (dark;
  green/amber/cyan). NOT yet eyeballed: trash, duplicates, import, CardDAV config,
  book-users, help, about; light "paper terminal" mode; the `multi` palette;
  mobile/responsive.

## Open risks / notes

- `sync-service` still uses native `bcrypt` in its own container (didn't error, but
  same latent musl risk) - optional follow-up.
- Light theme (`:root`, "paper terminal") is defined but lightly tested.
- Local QA used a hybrid: dockerized Postgres published on host `:5433` + host
  `npm run dev`, because the docker UI image needs a rebuild to pick up bcryptjs.
  These services have been torn down; `ui/.env.local` (DATABASE_URL -> :5433) and
  throwaway override `/tmp/sc-pgport.yml` may remain locally.

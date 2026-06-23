# next-steps — cycle 1 — 2026-06-23

Orchestrator memory for the `shared-contacts` design-unification effort.
Integration branch: `redesign/unify` (branched from `main` @ cc40689).

## Discovered facts

- **STACK** (`FACT-STACK`): TanStack Start (React 19 + TanStack Router v1 + TanStack Query v5) on Vite 7 / Nitro. SSR-capable. App lives in `ui/`. A separate `sync-service/` (Node) and `radicale/` (CardDAV server) round out the system but are **not** part of this UI redesign.
- **STYLING** (`FACT-STYLE`): Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first config in `ui/src/styles.css` via `@theme inline`). Design tokens are CSS custom properties in `:root` / `.dark` (oklch). shadcn/ui "new-york" style, base color zinc, lucide icons, `tw-animate-css`. `cn()` util at `@/lib/utils`. CVA for variants.
- **DESIGN_SYSTEM_PATH** (`FACT-DS`): `ui/src/components/ui/*` (20 shadcn primitives: accordion, button, card, checkbox, dialog, field, input, item, label, select, separator, sheet, skeleton, slider, sonner, spinner, switch, table, textarea, toggle, tooltip). Tokens in `ui/src/styles.css`. These are the FROZEN shared layer after the design-system step.
- **VERIFY_COMMANDS** (`FACT-VERIFY`) — exact, from `.github/workflows/test.yml`. Run from `ui/` unless noted:
  - Typecheck: `npx tsc --noEmit -p tsconfig.build.json`
  - Lint: `npm run lint`  (eslint, tanstack config)
  - Unit tests: `npm run test:unit`  (vitest run)
  - Format (from repo ROOT): `npm run format:check`  (prettier --check .). Agents should run `npx prettier --write <changed files>` before reporting.
  - No standalone `typecheck` npm script exists; use the tsc command above. Build (`vite build`) and docker-smoke exist in CI but are heavy; not part of the per-flow gate.
- **BASELINE** (`FACT-BASE`): On `redesign/unify` base, full gate is GREEN — typecheck PASS, lint PASS (1 pre-existing warning: `routes/api/mobileconfig.test.ts:16` require-await), 181 unit tests PASS, format PASS.
- **DO_NOT_TOUCH** (`FACT-DNT`): behavior must stay stable.
  - `ui/src/routes/api/**` (all API route handlers — public contracts)
  - `ui/src/lib/**` data/business layer: db, schemas, vcard, carddav, csv, merge, history, sync-service, mobileconfig-signer, validation, image, contact-helpers, history-format, logger. UI agents may READ but must not change behavior. (`cn`/`utils` styling helpers exempt — additive only.)
  - `sync-service/**`, `radicale/**`, `migrations/**`
  - Deploy/infra: `Dockerfile*`, `docker-compose*.yml`, `docker-entrypoint.sh`, `.env*`, `ui/nitro.config.ts`, `ui/vite.config.ts`, `ui/server/**`
  - Prod topology: cloudflared tunnel → `https://traefik:443` (must not regress).
- **DEAD CODE** (`FACT-DEAD`): `ui/src/components/ContactCard.tsx` is imported nowhere. Leave untouched (do not delete in this cycle; out of scope).

## Flow inventory (disjoint file ownership — no two flows share an editable file)

Shared chrome renders every flow but lives in separate files (no conflict). `components/ui/**` is frozen for all flow agents.

- [TODO] `REF-SHELL`  app-shell-and-nav — owns: `routes/__root.tsx`, `components/AppSidebar.tsx`, `components/MobileHeader.tsx`, `components/ThemeToggle.tsx`, `components/ThemeProvider.tsx`, `components/SupportDialog.tsx`
- [TODO] `REF-LIST`   contacts-list — owns: `routes/index.tsx`, `components/ContactAvatar.tsx`, `components/DeduplicateButton.tsx`, `components/MergeButton.tsx`  (ContactCard dead/untouched)
- [TODO] `REF-EDIT`   contact-editor — owns: `routes/$id.tsx`, `routes/new.tsx`, `components/ContactEditPane.tsx`, `components/ContactPreview.tsx`, `components/ContactHistoryPanel.tsx`, `components/ContactForm.tsx`, `components/AddressInput.tsx`, `components/PhoneInput.tsx`, `components/MultiFieldInput.tsx`, `components/contact-form/**`. NOTE: `$id` editor was already redesigned (commit dbbf61f) — it is the NORTH STAR. This flow's job: align to the frozen system + port the still-old `routes/new.tsx` (single-column `ContactForm`) onto the new editor.
- [TODO] `REF-BOOKS`  address-books — owns: `routes/books.tsx`
- [TODO] `REF-USERS`  book-users-admin — owns: `routes/radicale-users.tsx`
- [TODO] `REF-DAV`    carddav-config-admin — owns: `routes/carddav-connection.tsx`
- [TODO] `REF-DUP`    duplicates — owns: `routes/duplicates.tsx`
- [TODO] `REF-TRASH`  trash — owns: `routes/trash.tsx`
- [TODO] `REF-HIST`   history — owns: `routes/history.tsx`
- [TODO] `REF-IMPORT` import — owns: `routes/import.tsx`, `components/CSVUpload.tsx`
- [TODO] `REF-INFO`   help-and-about — owns: `routes/help.tsx`, `routes/about.tsx`

## Sequential prerequisites

- [TODO] `REF-LANG`   design-language.md (doc only, no code) — BLOCKS everything
- [TODO] `REF-SYS`    design-system (tokens + primitives refactor + design-system.md) — BLOCKS all flows; only agent allowed to edit `components/ui/**` and token block in `styles.css`

## Shared-change requests
(none yet — flow agents file these when a primitive needs changing)

## Open items / risks
- Worktree node_modules: fan-out worktrees must symlink `ui/node_modules` + root `node_modules` from the main checkout so verify commands work without `npm ci`.
- Pre-existing uncommitted change: `ui/package-lock.json` pins `nitro` `latest`→`3.0.1-alpha.2` (matches package.json). Harmless, left in working tree.
- `styles.css` is split: token block (REF-SYS owns) vs nothing else editable by flows. Flow agents must not touch `styles.css`.

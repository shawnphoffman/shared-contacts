# next-steps — cycle 1 — 2026-06-23 — COMPLETE

Design-unification cycle 1 for `shared-contacts`. Integration branch `redesign/unify`
(off `main` @ cc40689). All 11 flows integrated; full verification gate GREEN.
Resume here for cycle 2 (polish / visual QA / new-surface work).

## Discovered facts

- **STACK**: TanStack Start (React 19 + TanStack Router v1 + TanStack Query v5), Vite 7 / Nitro, SSR-capable. App in `ui/`. `sync-service/` + `radicale/` are out of UI scope.
- **STYLING**: Tailwind v4 (CSS-first, tokens in `ui/src/styles.css` `@theme inline`, oklch `:root`/`.dark`). shadcn "new-york", zinc base, lucide, `cn()` at `@/lib/utils`, CVA.
- **DESIGN_SYSTEM_PATH**: `ui/src/components/ui/*`. After cycle 1 it also contains the new shared layout primitives: `page-header.tsx`, `page-container.tsx`, `confirm-dialog.tsx`, `badge.tsx`. This is the FROZEN layer.
- **VERIFY_COMMANDS** (from `.github/workflows/test.yml`; run from `ui/` unless noted):
  - Typecheck: `npx tsc --noEmit -p tsconfig.build.json`
  - Lint: `npm run lint`
  - Unit tests: `npm run test:unit`
  - Format (repo ROOT): `npm run format:check` (agents run `npx prettier --write <files>` first)
- **FINAL GATE STATE**: typecheck PASS, lint PASS (1 PRE-EXISTING warning only: `routes/api/mobileconfig.test.ts:16` require-await), 181 unit tests PASS, format PASS.
- **DO_NOT_TOUCH** (held all cycle): `ui/src/routes/api/**`, `ui/src/lib/**` behavior, `sync-service/**`, `radicale/**`, `migrations/**`, Docker/compose/entrypoint, `.env*`, `ui/nitro.config.ts`, `ui/vite.config.ts`, `ui/server/**`. Prod topology cloudflared→`https://traefik:443`.
- **DEAD CODE**: `ui/src/components/ContactCard.tsx` was dead; left untouched. `ContactForm.tsx` became dead after the `/new` port and WAS deleted (its only importer was `new.tsx`).

## Sequential prerequisites — DONE

- [DONE] `REF-LANG` `ui/design-language.md` (ee6bfa5)
- [DONE] `REF-SYS` shared primitives + `ui/design-system.md` (31fb2fe). New frozen primitives: PageHeader, PageContainer, ConfirmDialog, Badge. NO token changes were needed.

## Flows — all DONE (checks PASS), disjoint file ownership

- [DONE] `REF-SHELL` app-shell-and-nav checks: PASS (684bea9)
- [DONE] `REF-LIST` contacts-list checks: PASS (bbebd36)
- [DONE] `REF-EDIT` contact-editor + /new checks: PASS (c8ddd9c) — /new ported to two-column editor; ContactForm.tsx deleted
- [DONE] `REF-BOOKS` address-books checks: PASS (4d8788e) — no delete endpoint exists, so no ConfirmDialog needed
- [DONE] `REF-USERS` book-users-admin checks: PASS (7f4e062) — title relabeled "Radicale Users"→"Book Users"
- [DONE] `REF-DAV` carddav-config-admin checks: PASS (5723102)
- [DONE] `REF-DUP` duplicates checks: PASS (477078d) — added a merge confirm step that did not exist before
- [DONE] `REF-TRASH` trash checks: PASS (400865b)
- [DONE] `REF-HIST` history checks: PASS (4e66eea)
- [DONE] `REF-IMPORT` import + CSVUpload checks: PASS (7128600)
- [DONE] `REF-INFO` help + about checks: PASS (dfb98ed)

## Integration decisions applied (design-language §10 tensions, all resolved)

D1 raw palette→tokens (done every flow). D2 PageHeader. D3 PageContainer narrow/standard/wide. D4 ConfirmDialog (retired all window.confirm/alert across list, edit, history, trash, duplicates, import). D5 Badge for status pills. D6 Card keeps token radius; rounded-2xl reserved for hero/preview/detail. D7 `…` ellipsis everywhere. Diff red/green kept as dark-aware pairs (sanctioned exception).

## Shared-change requests

- NONE filed across all 11 flows. The frozen design system was sufficient — strong signal it was scoped right.

## Resolved flags

- DAV-1: pre-existing em dash in macOS accordion copy → changed to a comma (matches user no-em-dash rule). Folded into the dav commit.

## Open items / cycle-2 candidates (NOT blockers)

- VISUAL QA DONE (2026-06-23): browsed every screen in a real browser, dark + light. Setup was a HYBRID — dockerized Postgres (full schema + 16 sample contacts) published on host port 5433 via a throwaway override `/tmp/sc-pgport.yml`, UI run on the HOST (`ui/.env.local` → localhost:5433) because the dockerized UI 500s on a PRE-EXISTING bcrypt/Alpine native-module issue (`unsupported relocation type 7`, glibc prebuild under musl) that also affects main and is unrelated to this redesign. Findings: list, /new (ported editor, confirmed), /$id editor, books, book-users, carddav, duplicates, history, import, about all render correctly; ConfirmDialog (history Undo) verified working; zero console errors; light mode correct (primary → near-black, not green). To reproduce: `docker compose -f docker-compose.yml -f /tmp/sc-pgport.yml up -d postgres`, then `cd ui && npm run dev`.
- KNOWN INFRA BUG (pre-existing, not from redesign): dockerized `ui` container cannot load bcrypt native binary on Alpine/musl. Worth a separate fix (rebuild bcrypt from source in the image, or swap to bcryptjs) so `docker compose up` works end-to-end.
- HEADER PARITY: `/$id` (edit) intentionally keeps its compact `text-lg` detail header (breadcrumb context) while `/new` uses the big `PageHeader`. Both are within the design language but create/edit look slightly different. Decide in cycle 2 whether to unify.
- HISTORY op pills still render via `operationBadgeClass` (in `lib/history-format.ts`, do-not-touch) rather than `Badge` — kept for cross-flow consistency with ContactHistoryPanel. Revisit only if that lib helper is opened up.
- DUP badge shows "N contacts" with variant carrying confidence; could add an explicit "High/Possible" word (copy-only).
- Worktrees were cleaned up after integration. Per-flow branches `redesign/<flow>` deleted; `redesign/unify` retained (not yet merged to main — awaiting user review).

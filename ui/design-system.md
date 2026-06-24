# Shared Contacts - Design System (Terminal, implementer reference)

The shared layer that every screen consumes. It implements the vocabulary in `design-language.md` (the Terminal identity). Compose what is here; do not hand-roll parallel widgets or hardcode colors.

All primitives live in `ui/src/components/ui/` and follow the same authoring style: CVA for variants, `cn` from `@/lib/utils`, `data-slot` attributes, plain function components, token-backed colors only.

---

## Theme foundation (`src/styles.css`)

- **Font:** JetBrains Mono globally (`body`), with `font-feature-settings: 'liga' 0`. Loaded via Google Fonts `@import`. (If you need offline/self-hosted builds, bundle the font and drop the remote import - tracked as a follow-up.)
- **Radius:** `--radius: 0.125rem` (near-zero). Sharp corners everywhere.
- **Tokens:** the standard shadcn token set (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--sidebar-*`) mapped to Tailwind via `@theme inline`. Light (`:root`) is a "paper terminal"; dark (`.dark`) is phosphor green.
- **Phosphor variants:** `data-phosphor` on `<html>` selects the accent palette in dark mode:
  - unset / `green` -> base `.dark` (phosphor green)
  - `amber` -> `.dark[data-phosphor='amber']` (amber on warm black)
  - `cyan` -> `.dark[data-phosphor='cyan']` (cyan/ice on near-black)
  - `multi` -> `.dark[data-phosphor='multi']` (green base, amber accents, red destructive)
    Each variant only overrides token values - all primitives inherit automatically. Add a new palette by adding one `.dark[data-phosphor='x'] { ... }` block; nothing else changes.
- The value is persisted to `localStorage('phosphor')` and re-applied pre-paint by an inline script in `__root.tsx` (no flash), then driven at runtime by `PhosphorToggle`.

**Rule:** never write a raw hex/color utility (`text-green-400`, `bg-[#...]`). Always use token utilities (`text-primary`, `bg-card`, `text-muted-foreground`, `border-border`) so all four palettes and both themes work. The only sanctioned exception is the history diff red/green, which must use dark-aware pairs.

---

## Primitives -> principle

| Primitive                               | Serves | Reach for this when...                                                                                               |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- | --------- | ----------- | --------- |
| `Button` (`button.tsx`)                 | §3, §6 | any action. One `default` per region; `outline` for secondary/row actions; `destructive` only for confirmed loss.    |
| `Card` (`card.tsx`)                     | §3     | a group is an object the user reasons about. Keeps the sharp token radius - no soft cards.                           |
| `Dialog` (`dialog.tsx`)                 | §6     | modal create/configure/confirm flows.                                                                                |
| `ConfirmDialog` (`confirm-dialog.tsx`)  | §6     | any destructive confirmation. Replaces `window.confirm`/`alert`. Does not auto-close; close in mutation `onSuccess`. |
| `Field` (`field.tsx`)                   | §3, §8 | every labeled input (`FieldLabel htmlFor` + `FieldContent`).                                                         |
| `Table` (`table.tsx`)                   | §2, §7 | collections. First column `font-medium`; right-aligned actions.                                                      |
| `Badge` (`badge.tsx`)                   | §4     | status tags. Renders bracketed (`[ Public ]`) for the terminal feel. Variants `default                               | secondary | destructive | outline`. |
| `Item` (`item.tsx`)                     | §9     | explainer/note blocks before risky admin actions.                                                                    |
| `Skeleton` / `Spinner`                  | §6     | first-load lists (skeleton) vs inline waits (spinner).                                                               |
| `PageHeader` (`page-header.tsx`)        | §7     | every top-level page title row.                                                                                      |
| `PageContainer` (`page-container.tsx`)  | §2, §7 | the outermost page wrapper. `width`: `narrow                                                                         | standard  | wide`.      |
| `PhosphorToggle` (`PhosphorToggle.tsx`) | §0     | the sidebar accent-palette switcher (green -> amber -> cyan -> multi).                                               |

---

## Signature patterns (terminal flourishes)

These are conventions, not always components. Apply them for the terminal identity:

- **Command bar.** Prefix a primary search/filter input with a phosphor prompt and command-style placeholder:
  ```tsx
  <div className="relative flex-1">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none font-medium text-primary">❯</span>
    <Input className="pl-8" placeholder="filter contacts: name, email, org…" ... />
  </div>
  ```
- **Status line.** An always-on row below collection controls - counts left, keyboard hints right:
  ```tsx
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
  	<span>
  		<span className="text-primary">{shown}</span> / {total} contacts
  	</span>
  	<span className="ml-auto hidden select-none sm:inline">↑↓ navigate · ⏎ open · ⌫ delete</span>
  </div>
  ```
- **Hover caret.** Navigable rows reveal `›` (add `group` to the row, caret uses `opacity-0 group-hover:opacity-100 text-primary`, `aria-hidden`).
- **Command footer.** End editing surfaces with a dim hint: `<p className="text-right text-xs text-muted-foreground"><span className="text-primary">:w</span> save · <span className="text-primary">esc</span> cancel</p>`.
- **Terminal nav.** Sidebar groups are paths (`~/contacts`, `~/books`, `~/help`); brand is `shared·contacts`.
- **Bracketed status.** Use `Badge` (auto-bracketed) for fact tags; neutral variants for neutral facts, `destructive`/`default` only for facts the user should react to.

Decorative glyphs (`❯`, `›`, status hints) are `select-none` and `aria-hidden` (or non-semantic) so they do not pollute screen readers or copy.

---

## Conventions (must follow)

- **Token-only colors** (§0/§4). No raw palette utilities; migrate on sight. Diff red/green is the one exception (dark-aware pairs).
- **Header + width** via `PageHeader` + `PageContainer`; never ad-hoc `<h1>` + `max-w-*` page padding.
- **Destructive / confirm** via `ConfirmDialog`; report outcomes with sonner toasts. No `window.confirm`/`alert`.
- **Pending labels:** disable + present-progressive verb + `…` (`Saving…`). Gate on real state.
- **Sharp corners:** do not reintroduce large radii; the terminal is rectilinear.
- **Every palette:** review new UI in green, amber, and cyan (toggle in the sidebar). If it only works in one, it is using a non-token color.

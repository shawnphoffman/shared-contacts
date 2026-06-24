# Shared Contacts - Design Language (Terminal)

This is a principles document, not a component spec. It describes how the app should look, read, and behave so that two worlds - everyday contact work and dense CardDAV administration - feel like one product. The chosen identity is **The Terminal**: a monospace, phosphor-on-near-black tool that treats the address book like a command-line workspace for self-hosters, while staying genuinely usable.

The north star is the contacts list and the contact editor: a command bar, a status line, dense rows, and a sticky live preview. When this document and an older screen disagree, the terminal patterns win.

---

## 0. Foundations (what is already true)

- **Mono-first.** The global font is JetBrains Mono (`styles.css`), with a system-monospace fallback. Everything - headings, body, tables, inputs - is monospace. This single choice carries most of the identity.
- **Dark-first phosphor.** Default theme is `dark` (`__root.tsx`); the dark theme is phosphor green on near-black. A light "paper terminal" variant exists and must keep working, but design and review in dark first.
- **Color is the signal.** The palette is intentionally near-monochrome (one phosphor hue) so the few bright things - the primary action, a tappable value, a destructive state - read as meaning, not decoration.
- **Swappable phosphor.** Four accent palettes ship: `green` (default), `amber`, `cyan`, and `multi` (green base with amber accents and red destructive, a syntax-highlight feel). They are selected by `data-phosphor` on `<html>` and rotated by the sidebar `PhosphorToggle`. Never hardcode a hue - always use tokens so all four palettes work.
- **Sharp, not soft.** `--radius` is near-zero (2px). Corners are crisp. The terminal is rectilinear.
- **Hairline structure.** Borders are thin, low-contrast (`--border`). Layout reads as a grid of cells and panes, not floating cards with shadows. No drop shadows.
- **Vocabulary is shadcn primitives + lucide, re-skinned by tokens.** The primitive set is fixed (`components/ui/`); the terminal look comes from the token layer plus a few signature flourishes, not from new widgets.

---

## 1. Voice & tone

Terse, precise, second-person, a little command-line. This is a tool a self-hoster lives in.

- **Labels: short, lowercase where it reads as a path or command.** Nav groups are paths (`~/contacts`, `~/books`, `~/help`). Field labels stay short nouns.
- **Buttons: imperative verb.** `Save`, `Cancel`, `New Contact`, `Export`. Keyboard-hint footers may use command syntax (`:w save`, `esc cancel`).
- **Prompts over placeholders.** Search reads as a command: `❯ filter contacts: name, email, org…`, not "Search contacts".
- **Status, always shown.** Surfaces report state in a status line: counts plus keyboard hints (`16 / 16 contacts · 3 books · ↑↓ navigate · ⏎ open · ⌫ delete`). State is ambient, like a shell.
- **Errors: state what failed, plainly.** Reuse the server's message via toast; do not wrap in "Oops".
- **Confirmations: name the object and consequence.** "Delete {name}? This cannot be undone." Always interpolate the real name.
- **No em dashes.** Use a hyphen, comma, or two sentences. (Applies to UI copy too.)

---

## 2. Density & rhythm

Compact and grid-like. The terminal is denser than a typical web app, but never below tap targets.

- Page scaffolding comes from `PageContainer` (named widths) + `PageHeader`; do not hand-roll page padding.
- Tables are the default for collections. Rows stay at shadcn default height; the identifying cell is `font-medium`, secondary metadata is `muted-foreground`.
- Machine values (slugs, usernames, IDs, CardDAV URLs, vCard fields) are already monospace, so lean on `muted-foreground` and brackets/labels to mark them.
- Group with hairline separators and `~/`-style section labels rather than nested cards.

---

## 3. Hierarchy

- **Cells and panes over cards.** Use a bordered panel when a group is an object the user reasons about (the live preview, a history feed). Avoid stacked elevated cards; structure with hairline borders.
- **Quiet titles.** The page title is the one loud element per screen (`PageHeader`). Section titles step down. The detail/editor keeps a compact header so the two-column layout dominates.
- **Primary vs secondary actions.** One `default` (phosphor) action per region, placed last and pushed right (`ml-auto`). Secondary actions are `outline`; repeated row actions are `outline` `size="sm"`.
- **Destructive actions are demoted** from the main row (overflow menu or a clearly separated `destructive` button), and always confirmed via `ConfirmDialog`.

---

## 4. Color intent

Color is meaning first, decoration almost never. One phosphor hue dominates; brightness encodes emphasis.

- **`primary`** = the one action or value the user most likely wants: default buttons, the command-prompt caret, live tappable values, active filters. The brightest phosphor.
- **`destructive`** = irreversible or data-losing. A red that survives every palette (kept red across green/amber/cyan/multi). Soft destructive surfaces use opacity tints (`bg-destructive/10`).
- **`muted` / `muted-foreground`** = everything secondary: labels, captions, placeholders, metadata, hints, dim nav. This dim phosphor is what makes the bright accent pop.
- **`secondary` / `accent`** = quiet interactive surfaces: secondary buttons, active tab/row tint, sidebar hover. In `multi`, accent shifts to amber for a syntax-highlight feel.
- **`sidebar-*`** is a distinct (slightly darker) surface so the nav reads as chrome.
- **Diff red/green** in history is a domain convention and must use dark-aware pairs; it is the only non-token color pairing allowed.
- **Every color decision must hold across all four phosphor palettes.** If something only looks right in green, it is wrong - use a token.

---

## 5. Typographic scale

JetBrains Mono throughout. Weight and brightness do the work fonts usually do.

| Role                    | Class                                           | Notes                                     |
| ----------------------- | ----------------------------------------------- | ----------------------------------------- |
| Page title              | `text-2xl font-bold tracking-tight sm:text-3xl` | via `PageHeader`, one per screen          |
| Detail/editor title     | `text-lg font-semibold`                         | compact header in `$id`                   |
| Section / card title    | `text-base font-semibold`                       |                                           |
| Body / control text     | `text-sm`                                       | inputs, buttons, table cells              |
| Label / caption / hints | `text-xs text-muted-foreground`                 | field labels, status line, command footer |
| Eyebrow / nav path      | `text-xs text-sidebar-foreground/50`            | `~/contacts` group labels                 |

- Two weights mainly: regular and medium/semibold. `font-bold` is for the page title only.
- Mono ligatures are disabled (`font-feature-settings: 'liga' 0`) so code-like glyphs stay literal.

---

## 6. Interaction patterns

- **Command bar.** Primary search/filter inputs lead with a phosphor `❯` prompt and a command-style placeholder. Keep the input itself a normal `Input`.
- **Status line.** Collections show an always-on status row: counts on the left, keyboard hints on the right (`ml-auto`). Hints may be aspirational/decorative but must match real affordances (navigate, open, delete).
- **Carets on hover.** Navigable rows reveal a `›` caret (`opacity-0 group-hover:opacity-100 text-primary`) to signal "enter".
- **Command footers.** Editing surfaces end with a dim command hint (`:w save · esc cancel`).
- **Buttons:** `default` (the single primary), `outline` (secondary / row actions), `secondary` (neutral inline), `ghost` (low-emphasis), `destructive` (confirmed loss only). Sizes: `default` page-level, `sm` in-table, `icon` icon-only (always `aria-label`).
- **Pending / disabled:** disable and swap the label to a present-progressive verb with the `…` ellipsis (`Saving…`, `Creating…`, `Deleting…`). Gate on real state.
- **Loading:** `Skeleton` for first-load lists; a centered muted line for single-object load.
- **Toasts (sonner):** fire-and-confirm outcomes (`toast.success`, `toast.error(message)`); never `window.alert`.
- **Destructive confirmation:** always `ConfirmDialog` with a named consequence; never `window.confirm`.
- **Validation:** inline, field-local (token `border-destructive` + a `text-destructive` message), scroll first error into view on submit.

---

## 7. Layout shells

The shell (`__root.tsx`) is a `h-screen` flex with a 16rem desktop sidebar (terminal nav) and one scrolling `<main>`. Pages own their padding/width via `PageContainer`.

- **Standard page header** = `PageHeader` (title + one-line muted description + right-aligned primary action). Every top-level page uses it.
- **Two-column detail** (`$id`, `/new`) = `max-w` wide, header row, then `grid gap-6 lg:grid-cols-2`: sticky live preview left; pill `Edit`/`History` tabs + action cluster + command footer right.
- **Admin list/table** = header → optional explainer → `Table` in a hairline border → dialogs for create/edit/confirm. Status line below the controls.
- **Sidebar** = `shared·contacts` brand, `~/`-pathed nav groups, footer with the phosphor toggle, theme toggle, and support.

---

## 8. Accessibility baseline

- **Contrast in phosphor.** Body text is `foreground` on `background`; secondary is `muted-foreground`. Verify every palette (amber and cyan differ from green); never drop below `muted-foreground` for anything a user must read.
- **Focus rings stay.** `--ring` plus `focus-visible:ring-[3px]` is baked into primitives and custom interactive elements (tabs, chips, toggle, rows). Never remove focus outlines.
- **Hit targets** >= `size-8`; page actions `h-9`.
- **Labels and names.** Every input pairs with a `Field` label; icon-only buttons carry `aria-label` (the phosphor toggle announces the current palette). Decorative glyphs (carets, `❯`, status hints) are `aria-hidden` / `select-none`.
- **Keyboard nav.** Navigable rows are reachable and activatable (`tabIndex`, Enter/Space) without breaking checkbox `stopPropagation`. Radix dialogs trap focus.
- **Semantics over divs.** Real `Table`, `<button>`, `<a>`.

---

## 9. Admin vs core feel

Same family, different posture. Admin is the same terminal in a careful mood.

- **Identical** tokens, font, primitives, header, focus rings, status-line behavior, voice.
- **Admin shifts:** tighter rhythm, an explainer note block before risky actions, machine values marked plainly, more up-front confirmation (the blast radius - sync clients, other users - is larger), status stated not celebrated (quiet bracketed `[ tags ]`, color only when the admin should react).
- The line to hold: admin may be denser and more cautious, but never reaches for a different font, a non-token color, a soft card, or `alert()`.

---

## North star

Shared Contacts is a calm, dark-first, monospace terminal where one phosphor hue carries all the meaning - the primary action, the value worth tapping, the destructive state - and everything else recedes into dim green (or amber, or cyan; the user picks). The list and editor set the bar: a `❯` command bar, an always-on status line, hover carets, a sticky live preview, command-footer hints, named-consequence dialogs, and toasts for quiet success. Admin screens are the same tool in a careful posture. Build new surfaces by reaching first for `PageHeader`/`PageContainer`, the command-bar/status-line patterns, and token-only color - so the whole app reads as one hand, in whatever phosphor the user has dialed in.

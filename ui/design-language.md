# Shared Contacts - Design Language

This is a principles document, not a component spec. It describes how the app should look, read, and behave so that two worlds - warm everyday contact work and dense CardDAV administration - feel like one product. Every principle is grounded in something already in the codebase; files are cited so the design-system step knows what to standardize against and what to retire.

The north star is the contact editor: `ui/src/routes/$id.tsx` plus `ContactEditPane.tsx`, `ContactPreview.tsx`, and `ContactHistoryPanel.tsx`. When this document and an older admin screen disagree, the editor wins.

---

## 0. Foundations (what is already true)

- **Dark-first.** Default theme is `dark` (`ui/src/routes/__root.tsx`). Light theme exists and must keep working, but design and review in dark mode first.
- **Tokens are oklch CSS custom properties** in `ui/src/styles.css` (`:root` + `.dark`), surfaced to Tailwind via `@theme inline`. Always use token-backed utilities (`bg-card`, `text-muted-foreground`, `border-border`, `text-destructive`), never raw palette utilities.
- **Accent is green in dark mode** (`--primary: oklch(79.2% 0.209 151.711)`). In light mode `--primary` is near-black zinc. So primary means "the main action," not "green" - do not hardcode green.
- **Radius scale** is driven by `--radius: 0.625rem` (≈ `rounded-lg`). The north star deliberately rounds _containers_ more: cards and panels use `rounded-2xl` (`ContactPreview.tsx`, `ContactHistoryPanel.tsx`), controls stay at `rounded-md`/`rounded-lg`.
- **Vocabulary is shadcn "new-york" + lucide.** The primitive set is fixed: `button, card, dialog, field, input, textarea, checkbox, select, switch, table, separator, item, sheet, skeleton, spinner, tooltip, accordion, sonner` (`ui/src/components/ui/`). Compose these; do not hand-roll parallel widgets.

---

## 1. Voice & tone

Plain, calm, second-person. This is a personal tool a self-hoster lives in, not enterprise software.

- **Labels: short nouns, sentence case, no colons.** `First`, `Last`, `Nickname`, `Organization`, `Job Title` (`ContactEditPane.tsx`). Prefer the shortest unambiguous word (`First`, not `First name`).
- **Buttons: imperative verb, sentence case.** `Save`, `Cancel`, `New Book`, `Backfill All Users`, `Download profile`. Avoid `OK`/`Submit`.
- **Empty states: one line of fact, then one action.** Follow `books.tsx` ("No address books yet" + a one-line why + a primary button) and generalize it. The bare-string empty states (`index.tsx` "No contacts yet. Create your first contact!") are the floor; lift them toward the Books pattern with an icon and a CTA.
- **Errors: state what failed, plainly.** Mutation errors already surface their server message (`error.message`) via toast in the editor. Reuse the server's sentence; do not wrap it in "Oops" or stack traces. The root error boundary sets the tone: "Something went wrong" + the message + a single recovery action (`__root.tsx`).
- **Confirmations: name the object and the consequence.** "Are you sure you want to delete {name}? This action cannot be undone." (`$id.tsx`, `radicale-users.tsx`). Always interpolate the actual name. Destructive verbs in the button (`Delete`, `Delete 3`), never "Yes."
- **Microcopy carries the meaning, color reinforces it.** "Unsaved changes," "turns 31 this year," "(public)," "(value not recorded)" - these small text cues are the app's personality. Keep them.
- **No em dashes.** Use a hyphen, comma, or two sentences.

---

## 2. Density & rhythm

Two cadences, one scale (Tailwind's 4px step). The difference between core and admin is _spacing chosen_, not a different system.

**Core / content surfaces** (contact editor, preview) breathe:

- Page padding: `px-4 py-6 sm:px-8` with a centered `max-w-6xl` for two-column detail (`$id.tsx`).
- Card internals: `p-6` panels (`ContactPreview.tsx`), `space-y-5` between stacked cards, `space-y-4` within a card, `gap-4` for paired fields (`ContactEditPane.tsx`).
- Section separation inside a panel uses a `Separator` with `my-5`, not just margin (`ContactPreview.tsx`).

**Admin / table surfaces** compress, but stay legible:

- Page padding: `p-6`, centered with a width cap matched to content - `max-w-2xl` for a single narrow table (`radicale-users.tsx`), `max-w-5xl` for wider tables (`books.tsx`, `index.tsx`). Pick the _smallest_ cap the content needs; full-bleed tables feel unowned.
- Vertical rhythm between page sections: `gap-6` (`radicale-users.tsx`) or `space-y-8` (`books.tsx`). Standardize on `gap-6` for admin pages.
- Table rows inherit shadcn defaults; do not tighten row height further. Use `font-medium` on the identifying cell (name/username) and `text-muted-foreground` + `text-xs`/`font-mono` for secondary metadata (slugs, IDs).

**Rules of thumb**

- Core: when in doubt, add a step of space. Admin: when in doubt, remove one - but never below `gap-2` between controls.
- Group related fields in a 2-up grid on `sm` and up (`grid-cols-1 ... sm:grid-cols-2`, seen for First/Last and Org/Title). Single fields stay full width.

---

## 3. Hierarchy

- **Cards vs bare sections.** Use a `Card` (or a `rounded-2xl border bg-card` panel) when a group is an _object the user reasons about_ - the Photo, Name, Email, the live preview, a history feed. Use bare `space-y` sections inside dialogs and for transient form clusters (`radicale-users.tsx` dialog bodies). Do not nest cards in cards; inside a card, separate sub-groups with a `Separator` or a labeled row, as the preview does.
- **Card titles are quiet.** `CardTitle` is overridden to `text-base` in the editor (`ContactEditPane.tsx`) so section titles do not compete with the page title. Keep card titles at `text-base font-semibold`/`font-medium`.
- **Field hierarchy** is `FieldLabel` (small, muted) over `FieldContent` (the control), via the `Field` primitive (`ui/src/components/ui/field.tsx`). Use it for every labeled input rather than ad-hoc `<label>` + `<input>`. Bare `<label>` is acceptable only for checkbox/switch rows where the control _is_ inline with its text.
- **Primary vs secondary actions.** One primary (`variant="default"`) action per region, placed last in reading order and pushed right (`ml-auto` / `justify-end`). Secondary actions are `outline`; tertiary/repeated row actions are `outline` `size="sm"` (the four-button action cluster in `radicale-users.tsx`). The editor's tab row is the canonical pattern: tabs left, `Cancel` (outline) then `Save` (default) pinned right with `ml-auto` (`$id.tsx`).
- **Destructive actions are demoted from the main row.** Delete lives behind a `MoreHorizontal` overflow menu in the preview (`ContactPreview.tsx`) or as a clearly separated `destructive` button - never sitting casually beside Save.

---

## 4. Color intent

Color is meaning first, decoration almost never. The palette is intentionally near-monochrome zinc so that the few colored things read as signal.

- **`primary`** = the one action or value the user most likely wants. Default buttons, active filter chips (`index.tsx`), and live contact values (emails/phones/URLs render `text-primary` in the preview because they are tappable). Do not use primary as a generic "brand color" sprinkle.
- **`destructive`** = irreversible or data-losing. Delete buttons, "No Email" exclusion filters (`bg-destructive` in `index.tsx`), error text (`text-destructive`). Use the token, with tints via opacity (`hover:bg-destructive/10`, `bg-destructive/10`) for soft destructive surfaces (`ContactPreview.tsx` delete item).
- **`muted` / `muted-foreground`** = everything secondary: labels, captions, placeholders, metadata, type chips, empty-state copy. This is the most-used "color" in the app and is what makes the primary/destructive accents pop.
- **`secondary` / `accent`** = neutral interactive surfaces: the `secondary` action buttons (Email/Call in the preview), the active tab background, sidebar hover. Quiet, not colorful.
- **`sidebar-*` tokens** are a distinct surface so the nav reads as chrome, not content (`AppSidebar.tsx`). Never use sidebar tokens in the main content area or vice versa.
- **Diff semantics**: removed = red with strike-through, added = green, arrow between (`ContactHistoryPanel.tsx`). This red/green is the _only_ sanctioned non-token color, and it must use dark-mode-aware pairs (`text-red-700 dark:text-red-400`, `text-green-700 dark:text-green-400`). Treat it as a domain convention, not a general palette.
- **Status pills** (Public/Private, Read-only Yes/No in `books.tsx`) currently use raw `bg-green-100 / bg-gray-100 / bg-yellow-100`. This is a tension (see §10). The intent is: a pill states a fact; reserve color for facts the admin should _react to_ (e.g. "Private," "Read-only on"), and keep neutral facts in a `bg-muted` pill.

**Dark-first reality:** verify every color decision against the dark `:root`. Greens and reds shift; muted-on-card contrast is tighter. The `text-gray-*` / `text-red-600 bg-red-50` literals scattered in `index.tsx` and `radicale-users.tsx` look fine in light mode and wrong in dark - they must migrate to tokens.

---

## 5. Typographic scale

System font stack, antialiased (`styles.css`). Standardize on these steps (all already in use):

| Role                 | Class                                           | Where                                                                                             |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Page title           | `text-2xl font-bold tracking-tight sm:text-3xl` | `books.tsx` (adopt as the standard; `index.tsx`/`radicale-users.tsx` jump straight to `text-3xl`) |
| Detail/editor title  | `text-lg font-semibold`                         | `$id.tsx` header                                                                                  |
| Preview name (hero)  | `text-xl font-bold`                             | `ContactPreview.tsx`                                                                              |
| Section / card title | `text-base font-semibold`                       | `ContactEditPane.tsx` (`CardTitle` → `text-base`)                                                 |
| Body / control text  | `text-sm`                                       | inputs, buttons, table cells, preview values                                                      |
| Label / caption      | `text-xs text-muted-foreground`                 | field labels, eyebrows, metadata                                                                  |
| Eyebrow (uppercase)  | `text-xs font-medium uppercase tracking-wider`  | sidebar group headers (`AppSidebar.tsx`)                                                          |
| Micro / mono         | `text-[10px]`/`text-[11px] font-mono`           | type chips, raw vCard, IDs                                                                        |

Rules:

- One `text-2xl`/`text-3xl` page title per screen. Everything else steps down from there.
- `font-bold` is for titles and the preview name only; controls and section titles use `font-medium`/`font-semibold`.
- Monospace (`font-mono`) signals "machine value": vCard fields, slugs, CardDAV URLs, type chips, history diffs.

---

## 6. Interaction patterns

**Buttons** (variants from `ui/components/ui/button.tsx`):

- `default` - the single primary action.
- `outline` - secondary actions and the default for repeated row/admin actions.
- `secondary` - neutral inline actions on content (Email/Call).
- `ghost` - low-emphasis affordances inside a dense row (Undo in history).
- `destructive` - confirmed data loss only.
- `link` - inline navigation in prose.
- Sizes: `default` for page-level, `sm` for in-table/in-card clusters, `icon`/`icon-sm` for icon-only (always with `aria-label`).

**Pending / disabled / loading:**

- Disable the action and swap the label to a present-progressive verb: `Saving…`, `Deleting...`, `Creating...`, `Backfilling...` (everywhere). Standardize the ellipsis character to `…`.
- Gate on real state: `disabled={!form.isDirty || mutation.isPending}` (`$id.tsx`). Save is disabled when there is nothing to save.
- Use `Skeleton` for first-load of list/table content (`index.tsx`, `books.tsx`), and a centered muted line ("Loading contact…") for single-object load (`$id.tsx`). Prefer skeletons over spinners for layout-shaped waits.

**Toasts (sonner, mounted in `__root.tsx`):**

- Use for _fire-and-confirm_ outcomes that do not need acknowledgment: `toast.success('Contact saved')`, `toast.success('Change undone')`, and `toast.error(message)` on mutation failure (`$id.tsx`, `ContactHistoryPanel.tsx`).
- Do **not** use `window.alert` for results - `index.tsx` bulk operations still do this and must move to toasts.

**Dialogs vs inline editing:**

- Inline editing for the primary object (the contact, edited live with a preview). This is the model.
- `Dialog` for create/configure/confirm flows that are modal by nature: new user, edit book, connection details, delete confirm. Dialog body uses `space-y-4 py-2`, actions in `DialogFooter` with Cancel (outline) + primary.

**Destructive confirmation:**

- Use a `Dialog` with a named consequence for object deletion (`$id.tsx`, `radicale-users.tsx`) - this is the target pattern.
- `window.confirm` is still used for Undo and bulk delete (`ContactHistoryPanel.tsx`, `index.tsx`). Acceptable as a stopgap; the design system should replace these with the dialog pattern (or an "undo" toast) for consistency.

**Form validation feedback:**

- Inline, field-local, on the offending control: red border + a `text-sm` message directly beneath (`ContactEditPane.tsx` email/url). On submit, validate all and scroll the first error into view (`$id.tsx` `handleSave`). Do not block the whole form with a single banner when the problem is one field.
- Dialog-level errors (auth, server validation) render as a tinted strip at the bottom of the dialog body using `text-destructive bg-destructive/10` (the tokenized form already in `books.tsx` edit dialog) - not the raw `bg-red-50` form.

---

## 7. Layout shells

The app shell is fixed (`__root.tsx`): a `h-screen` flex with a 16rem desktop sidebar (`md:w-64`, hidden on mobile behind `MobileHeader`) and a single scrolling `<main>`. Pages own their own padding and width; the shell adds none.

**Standard page header convention** (adopt `books.tsx` as canonical):

```
flex column on mobile, row on sm:
  left:  h1  (text-2xl font-bold tracking-tight sm:text-3xl)
         p   (mt-1 text-sm text-muted-foreground)  - one-line description
  right: primary action button  (shrink-0)
```

- Every top-level page gets a title and a one-line muted description. `index.tsx` and `radicale-users.tsx` omit/relocate the description and use a leading icon + `text-3xl`; reconcile toward the Books header. A leading icon next to the title is optional and decorative - keep it `size-5`/`size-8` and muted if used.
- The primary action lives top-right of the header. Bulk/contextual actions appear in a separate action bar that only renders when a selection exists (`index.tsx` selection bar, separated by `border-t pt-4`).

**Two-column detail pattern** (`$id.tsx`) - the signature layout:

- `mx-auto max-w-6xl`, header row, then `grid items-start gap-6 lg:grid-cols-2`.
- Left column = sticky live preview (`lg:sticky lg:top-6`) so the result stays visible while editing.
- Right column = a pill tab switch (`Edit` / `History`) with the contextual action cluster (`Cancel`/`Save`) on the same row, pushed right.
- Use this whenever editing benefits from immediate feedback. The "new contact" screen should be ported to it (noted as pending in project memory).

**Admin list/table pattern** (`books.tsx`, `radicale-users.tsx`):

- Header (as above) → optional explanatory `Item`/note block → `Table` wrapped in `rounded-md border` → dialogs for create/edit/confirm.
- Tables: first column is the human identifier (`font-medium`); a right-aligned `Actions` column holds an `outline size="sm"` button cluster; secondary columns collapse on narrow screens (`hidden sm:table-cell`, `hidden lg:table-cell`).
- Empty state replaces the table with the icon + copy + CTA card (`books.tsx`), not a bare sentence.

---

## 8. Accessibility baseline

- **Focus rings exist - keep them.** The `--ring` token plus `focus-visible:ring-ring/50 focus-visible:ring-[3px]` is baked into the button and the global `outline-ring/50` (`styles.css`, `button.tsx`). Never remove focus outlines; custom interactive elements (the tab buttons, filter chips, overflow menu items) must show a visible focus state too.
- **Dark-mode contrast.** Body text is `foreground` on `background`/`card`; secondary text is `muted-foreground`. Do not drop below `muted-foreground` for anything a user must read. The `text-gray-400` "—" placeholders and `text-gray-500` subtitles in `index.tsx` are below intent in dark mode - use `muted-foreground`.
- **Hit targets.** Page actions are `h-9`+ (default button); compact actions are `h-8` (`size="sm"`); icon-only is `size-8`/`size-9`. Do not go below `size-8` for anything tappable, especially on the mobile header.
- **Labels and names.** Every input pairs with a `FieldLabel htmlFor` (`Field` primitive). Icon-only buttons carry `aria-label` ("More actions," "Support," "Filter by address book") - this is already consistent; keep it mandatory. Disclosure toggles set `aria-expanded` (`ContactPreview.tsx` raw-vCard toggle).
- **Keyboard nav.** Rows that navigate on click (`index.tsx`) must also be reachable and activatable by keyboard; selection checkboxes already `stopPropagation` so they do not trigger row navigation - preserve that separation. Dialogs (Radix) trap focus by default; do not defeat it.
- **Semantics over divs.** Use the `Table` primitive for tabular data (not stacked divs), real `<button>`/`<a>` for actions (the preview uses `Button asChild` over `<a href="mailto:">`), and `<label>` wrapping for checkbox rows.

---

## 9. Admin vs core feel

Same family, different posture. The goal: an admin screen should feel like the _same app in a focused, careful mood_, not a different product.

**What stays identical** (the family resemblance):

- Same tokens, same fonts, same button variants, same `Field`/`Dialog`/`Table` primitives, same header convention, same toast/skeleton behavior, same focus rings.
- Same voice: plain, second-person, named consequences.

**What shifts in admin** (the "configuration, handle with care" signal):

- **Tighter rhythm, narrower column.** `gap-6`, `p-6`, a deliberate `max-w` cap (§2). Density says "this is a control surface."
- **Explain before you let them act.** Admin pages lead with a muted description and, where an action is risky or non-obvious, an `Item` note block explaining it (the backfill explainer in `radicale-users.tsx`). Core screens rarely need this; admin screens usually do.
- **Machine values look like machine values.** Slugs, usernames, IDs, CardDAV URLs in `font-mono text-muted-foreground` with copy affordances (`books.tsx` connection dialog). This visually marks "exact strings that matter."
- **Confirm more, undo less.** Admin mutations (delete user, change password, change visibility) are dialog-confirmed and name the target. Where core work offers soft recovery (Undo, "Unsaved changes," toast), admin leans on up-front confirmation because the blast radius (sync clients, other users) is larger.
- **Status is stated, not celebrated.** Public/Private, Read-only - quiet pills, color only when the admin should notice (§4). No primary-green decoration on a settings table.

The line to hold: admin may be denser and more cautious, but it must never reach for a different button, a different card radius, a raw hex color, or `alert()` where the core app would use a token, a `rounded-2xl` panel, or a toast.

---

## 10. Tensions to resolve (for the design-system step)

These are real inconsistencies found in the current app; the editor/Books patterns indicate the intended direction.

1. **Raw palette literals vs tokens.** `text-gray-400/500`, `text-red-600 bg-red-50`, `bg-green-100/bg-yellow-100/bg-gray-100` pills (`index.tsx`, `radicale-users.tsx`, `books.tsx`). Target: tokens (`muted-foreground`, `text-destructive bg-destructive/10`, tokenized status pills). Dark-mode correctness depends on this.
2. **Page header divergence.** `books.tsx` (title + description + `tracking-tight` + responsive size) vs `index.tsx`/`radicale-users.tsx` (`text-3xl`, icon, no description). Pick one header component.
3. **Width and padding caps vary** (`max-w-2xl` / `max-w-5xl` / `max-w-6xl`, `p-6` / `py-8`). Define a small set of page "widths" (narrow form, standard table, wide detail) and matching padding.
4. **Confirmation mechanism is split** between `Dialog` (named, on-brand) and `window.confirm` / `window.alert` (`index.tsx`, `ContactHistoryPanel.tsx`). Converge on Dialog + toast.
5. **Card radius is dual:** shadcn `Card` (`rounded-lg`-ish) vs the north-star hand-rolled `rounded-2xl border bg-card` panels. Decide whether `Card` adopts the larger radius or whether the bigger radius is reserved for hero/preview panels - then apply it consistently.
6. **Ellipsis inconsistency:** `Saving…` (editor) vs `Creating...` (admin). Trivial, but pick one.

---

## North star

Shared Contacts is a calm, dark-first, near-monochrome tool where color is reserved for meaning - the one primary action, the one destructive action, the one value worth tapping - and everything else recedes into muted zinc and quiet type. The contact editor sets the bar: a `rounded-2xl` card world with a sticky live preview, tabbed edit/history, inline field-local validation, named-consequence confirmation dialogs, and toasts for quiet success. Admin screens are the same product in a more careful posture: same tokens, primitives, header, and focus rings, just tighter, better-explained, more confirmation-heavy, and honest about machine values. Build new surfaces by reaching first for the editor and Books patterns, and resolve every raw `gray`/`red-50`/`alert()` you find back into the token-and-toast vocabulary - so the warm everyday surface and the nitty-gritty admin always read as one hand.

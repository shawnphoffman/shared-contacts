# Shared Contacts - Design System (implementer reference)

This is the FROZEN shared layer that flow agents consume. It implements the vocabulary in `design-language.md` and resolves its §10 tensions. Do not author new shared primitives this cycle. Compose what is here.

All primitives live in `ui/src/components/ui/` and follow the same authoring style: CVA for variants, `cn` from `@/lib/utils`, `data-slot` attributes, plain function components (no `forwardRef`), token-backed colors only.

---

## Primitives → principle

| Primitive                                  | Serves                                   | Reach for this when...                                                                                                 |
| ------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Button` (`button.tsx`)                    | §3 primary/secondary, §6 variants        | any action. One `default` per region, `outline` for secondary/row actions, `destructive` only for confirmed data loss. |
| `Card` (`card.tsx`)                        | §3 hierarchy                             | a group is an object the user reasons about. Keeps its token radius (see D6).                                          |
| `Dialog` (`dialog.tsx`)                    | §6 modal flows                           | create/configure/confirm flows that are modal by nature.                                                               |
| `Field` (`field.tsx`)                      | §3 field hierarchy, §8 labels            | every labeled input. `FieldLabel htmlFor` + `FieldContent`.                                                            |
| `Table` (`table.tsx`)                      | §7 admin list pattern                    | tabular data. First column `font-medium`, right-aligned Actions column.                                                |
| `Item` (`item.tsx`)                        | §3, §9 admin explainers                  | note/explainer blocks and list rows that are not a full table.                                                         |
| `Skeleton` / `Spinner`                     | §6 loading                               | first-load of list/table content (skeleton) vs inline waits (spinner).                                                 |
| **`PageHeader`** (`page-header.tsx`)       | §7 header convention, §10 #2             | every top-level page title row. Generalizes the Books header.                                                          |
| **`PageContainer`** (`page-container.tsx`) | §2 density, §10 #3                       | the outermost page wrapper. Named width + consistent padding.                                                          |
| **`ConfirmDialog`** (`confirm-dialog.tsx`) | §1/§6 named-consequence confirms, §10 #4 | any destructive confirmation. Replaces `window.confirm`/`alert`.                                                       |
| **`Badge`** (`badge.tsx`)                  | §4 status pills, §10 #1                  | status pills. Replaces raw `bg-green-100`/`bg-gray-100` pills with tokenized variants.                                 |

---

## Canonical usage

### PageHeader

```tsx
import { PageHeader } from '@/components/ui/page-header'
;<PageHeader
	title="Address Books"
	description="Manage address books and view connection details."
	actions={
		<Button onClick={() => setOpen(true)}>
			<Plus className="mr-2 h-4 w-4" />
			New Book
		</Button>
	}
/>
```

- `title` type step is fixed at `text-2xl font-bold tracking-tight sm:text-3xl` - do not override it.
- `description` is one line, `text-sm text-muted-foreground`.
- `icon` is optional and decorative (muted, `size-6`/`size-7`); pass a lucide node.
- `actions` (or `children`) is the right-aligned, `shrink-0` slot. Put the single primary action here.

### PageContainer

```tsx
import { PageContainer } from '@/components/ui/page-container'

<PageContainer width="standard">
	<PageHeader ... />
	{/* page body */}
</PageContainer>
```

- `width`: `narrow` (`max-w-2xl`, single narrow form/table) | `standard` (`max-w-5xl`, default, admin tables) | `wide` (`max-w-6xl`, two-column detail).
- Padding is fixed at `px-4 py-6 sm:px-6 lg:px-8` plus `mx-auto w-full`. Do not re-add page padding/centering on children.
- `className` is merged via `cn` for body spacing (e.g. `className="space-y-6"`).

### ConfirmDialog

```tsx
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
;<ConfirmDialog
	open={open}
	onOpenChange={setOpen}
	title={`Delete ${name}?`}
	description="This cannot be undone."
	confirmLabel="Delete"
	pendingLabel="Deleting…"
	onConfirm={() => deleteMutation.mutateAsync(id)}
	pending={deleteMutation.isPending}
/>
```

- Controlled: `open` + `onOpenChange`.
- Always name the object and consequence in `title`/`description`.
- `variant` defaults to `destructive` (confirm button). Use `default` for non-destructive confirms.
- `confirmLabel` defaults to `Delete`, `cancelLabel` to `Cancel`.
- `pending` disables both buttons and relabels confirm. Pass `pendingLabel` for the present-progressive form (`Deleting…`); if omitted it falls back to `confirmLabel` + `…`.
- `onConfirm` may be async. The dialog does not auto-close - close it in your mutation `onSuccess` (or via `onOpenChange`).
- Footer order is fixed: Cancel (outline, left) then confirm (right).

### Badge

```tsx
import { Badge } from '@/components/ui/badge'

<Badge variant="secondary">Public</Badge>
<Badge variant="outline">Private</Badge>
<Badge variant="destructive">Read-only</Badge>
```

- Variants: `default` | `secondary` | `destructive` | `outline`.
- Per §4, a pill states a fact. Use a neutral variant (`secondary`/`outline`) for neutral facts; reserve `destructive`/`default` color for facts the admin should react to. Do not celebrate routine status with primary color.

---

## Conventions (resolved tensions - flow agents must follow)

### Token-only colors (§4, §10 #1)

Never ship raw palette utilities. Migrate on sight:

| Raw                                                       | Token                                |
| --------------------------------------------------------- | ------------------------------------ |
| `text-gray-400`, `text-gray-500`                          | `text-muted-foreground`              |
| `text-red-600 bg-red-50` (and `dark:bg-red-950` variants) | `text-destructive bg-destructive/10` |
| `bg-green-100 / bg-gray-100 / bg-yellow-100` status pills | `<Badge>` with a semantic variant    |

Soft destructive surfaces use opacity tints on the token (`bg-destructive/10`, `hover:bg-destructive/10`).

**The one sanctioned exception:** diff red/green in history (`ContactHistoryPanel.tsx`). Removed = red strike-through, added = green, and it MUST use dark-mode-aware pairs (`text-red-700 dark:text-red-400`, `text-green-700 dark:text-green-400`). This is a domain convention, not a general palette - do not reuse these literals anywhere else.

### Header convention (§7, §10 #2)

Every top-level page uses `PageHeader` (title + one-line muted description + right-aligned primary action). Never hand-roll an `<h1>` page title. Set page width with `PageContainer` (`narrow`/`standard`/`wide`), never ad-hoc `max-w-*` + padding on the page root.

### Destructive / confirm convention (§6, §10 #4)

Use `ConfirmDialog` for destructive confirmations. No `window.confirm`, no `window.alert`. Report outcomes with toasts (sonner): `toast.success(...)` on success, `toast.error(message)` on failure (reuse the server's `error.message`, do not wrap it).

### Pending label convention (§6, §10 #6)

While an action is pending: disable the control and swap its label to a present-progressive verb with the ellipsis character `…` (`Saving…`, `Deleting…`, `Creating…`). Never the three-dot `...`. Gate on real state (`disabled={!form.isDirty || mutation.isPending}`).

### Card radius rule - D6 (§0, §10 #5)

`Card` keeps its token radius (`rounded-xl`, driven by `--radius`). The larger `rounded-2xl` is reserved for hero / live-preview / detail panels (`ContactPreview.tsx`, `ContactHistoryPanel.tsx`) - hand-rolled `rounded-2xl border bg-card` panels, not `Card`. Do not bump `Card`'s radius, and do not use `rounded-2xl` for ordinary content cards.

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = 'Delete',
	pendingLabel,
	cancelLabel = 'Cancel',
	onConfirm,
	variant = 'destructive',
	pending = false,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: React.ReactNode
	description?: React.ReactNode
	confirmLabel?: string
	/** Present-progressive label shown while pending, e.g. "Deleting…". Defaults to confirmLabel + "…". */
	pendingLabel?: string
	cancelLabel?: string
	onConfirm: () => void | Promise<void>
	variant?: 'destructive' | 'default'
	pending?: boolean
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent data-slot="confirm-dialog">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
						{cancelLabel}
					</Button>
					<Button variant={variant} onClick={() => onConfirm()} disabled={pending}>
						{pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export { ConfirmDialog }

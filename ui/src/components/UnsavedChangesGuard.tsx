import { useBlocker } from '@tanstack/react-router'
import { ConfirmDialog } from './ui/confirm-dialog'

/**
 * Stop a navigation away from unsaved edits, and ask first.
 *
 * The editor showed an "Unsaved changes" badge but nothing acted on it: a
 * click on any sidebar link, or the browser's back button, dropped the edits
 * without a word.
 */
export function UnsavedChangesGuard({ when, disabled = false }: { when: boolean; disabled?: boolean }) {
	const blocker = useBlocker({
		shouldBlockFn: () => when,
		// Covers closing the tab or reloading, which router blocking cannot see.
		enableBeforeUnload: () => when,
		disabled,
		withResolver: true,
	})

	return (
		<ConfirmDialog
			open={blocker.status === 'blocked'}
			onOpenChange={open => {
				if (!open) blocker.reset?.()
			}}
			title="Discard unsaved changes?"
			description="This contact has edits that have not been saved. Leaving now loses them."
			confirmLabel="Discard and leave"
			cancelLabel="Keep editing"
			onConfirm={() => blocker.proceed?.()}
		/>
	)
}

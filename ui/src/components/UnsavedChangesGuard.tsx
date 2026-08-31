import { useCallback, useRef } from 'react'
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
	// useBlocker re-registers whenever these callbacks change identity, and
	// opening the dialog is itself a re-render. Inline arrows therefore tore down
	// the blocker holding the paused navigation, so "Discard and leave" resolved
	// a promise nobody was waiting on and the navigation never resumed. Keep the
	// callbacks stable and read the current value through a ref.
	const whenRef = useRef(when)
	whenRef.current = when

	const shouldBlockFn = useCallback(() => whenRef.current, [])
	// Covers closing the tab or reloading, which router blocking cannot see.
	const enableBeforeUnload = useCallback(() => whenRef.current, [])

	const blocker = useBlocker({
		shouldBlockFn,
		enableBeforeUnload,
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

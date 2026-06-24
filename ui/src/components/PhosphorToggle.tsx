import { useEffect, useState } from 'react'

const ORDER = ['green', 'amber', 'cyan', 'multi'] as const
type Phosphor = (typeof ORDER)[number]

const DOT: Record<Phosphor, string> = {
	green: '#7cffb2',
	amber: '#ffb000',
	cyan: '#22d3ee',
	multi: '#7cffb2',
}

function isPhosphor(value: string | null): value is Phosphor {
	return value !== null && (ORDER as ReadonlyArray<string>).includes(value)
}

/**
 * Cycles the terminal accent palette (green -> amber -> cyan -> multi) by setting
 * data-phosphor on <html>; the value is persisted and re-applied pre-paint by a
 * small inline script in the root document.
 */
export function PhosphorToggle() {
	const [mounted, setMounted] = useState(false)
	const [phosphor, setPhosphor] = useState<Phosphor>('green')

	useEffect(() => {
		setMounted(true)
		const current = document.documentElement.getAttribute('data-phosphor')
		setPhosphor(isPhosphor(current) ? current : 'green')
	}, [])

	const cycle = () => {
		const next = ORDER[(ORDER.indexOf(phosphor) + 1) % ORDER.length]
		setPhosphor(next)
		document.documentElement.setAttribute('data-phosphor', next)
		try {
			localStorage.setItem('phosphor', next)
		} catch {
			// ignore storage failures (private mode, etc.)
		}
	}

	const label = mounted ? phosphor : 'green'

	return (
		<button
			type="button"
			onClick={cycle}
			aria-label={`Accent palette: ${label}. Click to change.`}
			title={`phosphor: ${label}`}
			className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs uppercase tracking-wider text-sidebar-foreground/80 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50"
		>
			<span
				className="size-3 shrink-0 rounded-full"
				style={{ background: DOT[label], boxShadow: `0 0 6px ${DOT[label]}` }}
				aria-hidden="true"
			/>
			<span suppressHydrationWarning>{label}</span>
		</button>
	)
}

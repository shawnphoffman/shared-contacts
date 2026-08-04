import { useEffect, useState } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { AppSidebar } from './AppSidebar'
import { MobileHeader } from './MobileHeader'

/**
 * Desktop shell with a collapsible sidebar: collapsed, the sidebar shrinks to
 * a slim rail with just the expand control, giving wide pages (relationship
 * trees, the contacts table) the full viewport width. Preference persists in
 * localStorage. Mobile keeps the existing sheet-based header navigation.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
	const [collapsed, setCollapsed] = useState(false)

	useEffect(() => {
		try {
			setCollapsed(localStorage.getItem('sidebar-collapsed') === '1')
		} catch {
			// localStorage unavailable - stay expanded
		}
	}, [])

	const toggle = () => {
		setCollapsed(current => {
			try {
				localStorage.setItem('sidebar-collapsed', current ? '0' : '1')
			} catch {
				// non-fatal
			}
			return !current
		})
	}

	return (
		<div className="flex h-screen overflow-hidden">
			{/* Desktop sidebar / rail */}
			{collapsed ? (
				<aside className="hidden md:flex md:w-10 md:shrink-0 md:flex-col md:items-center md:border-r md:border-sidebar-border md:bg-sidebar md:py-2">
					<button
						type="button"
						onClick={toggle}
						aria-label="Expand sidebar"
						className="flex h-7 w-7 items-center justify-center rounded-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						<PanelLeftOpen className="size-4" />
					</button>
				</aside>
			) : (
				<aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-sidebar-border">
					<AppSidebar onCollapse={toggle} />
				</aside>
			)}

			{/* Main content area */}
			<div className="flex flex-1 flex-col overflow-hidden">
				<MobileHeader />
				<main className="flex-1 overflow-y-auto">{children}</main>
			</div>
		</div>
	)
}

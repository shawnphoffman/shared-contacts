import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
	BookOpen,
	ContactRound,
	Heart,
	HelpCircle,
	History,
	Info,
	Link as LinkIcon,
	NotebookTabs,
	Trash2,
	Upload,
	Users,
} from 'lucide-react'

import { ThemeToggle } from './ThemeToggle'
import { SupportDialog } from './SupportDialog'
import { Separator } from './ui/separator'

const navLinkClass =
	'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring/50 focus-visible:ring-[3px]'
const navLinkActiveClass =
	'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium bg-sidebar-accent text-sidebar-accent-foreground outline-none focus-visible:ring-sidebar-ring/50 focus-visible:ring-[3px]'
const groupLabelClass = 'mb-1 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60'

interface AppSidebarProps {
	onNavigate?: () => void
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
	const [supportOpen, setSupportOpen] = useState(false)

	return (
		<aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			{/* Branding */}
			<div className="flex h-14 items-center gap-2 px-4">
				<NotebookTabs className="size-5 shrink-0" />
				<span className="text-base font-semibold tracking-tight">Shared Contacts</span>
			</div>

			<Separator className="bg-sidebar-border" />

			{/* Navigation */}
			<nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
				{/* Contacts */}
				<div className="space-y-1">
					<p className={groupLabelClass}>Contacts</p>
					<Link
						to="/"
						search={{ book: undefined }}
						activeOptions={{ exact: true }}
						className={navLinkClass}
						activeProps={{ className: navLinkActiveClass }}
						onClick={onNavigate}
					>
						<ContactRound className="size-4 shrink-0" />
						All Contacts
					</Link>
					<Link to="/import" className={navLinkClass} activeProps={{ className: navLinkActiveClass }} onClick={onNavigate}>
						<Upload className="size-4 shrink-0" />
						Import
					</Link>
					<Link to="/trash" className={navLinkClass} activeProps={{ className: navLinkActiveClass }} onClick={onNavigate}>
						<Trash2 className="size-4 shrink-0" />
						Deleted
					</Link>
					<Link
						to="/history"
						search={{ contactId: undefined }}
						className={navLinkClass}
						activeProps={{ className: navLinkActiveClass }}
						onClick={onNavigate}
					>
						<History className="size-4 shrink-0" />
						History
					</Link>
				</div>

				{/* Address Books */}
				<div className="space-y-1">
					<p className={groupLabelClass}>Address Books</p>
					<Link to="/books" className={navLinkClass} activeProps={{ className: navLinkActiveClass }} onClick={onNavigate}>
						<BookOpen className="size-4 shrink-0" />
						All Books
					</Link>
					<Link to="/radicale-users" className={navLinkClass} activeProps={{ className: navLinkActiveClass }} onClick={onNavigate}>
						<Users className="size-4 shrink-0" />
						Book Users
					</Link>
					<Link to="/carddav-connection" className={navLinkClass} activeProps={{ className: navLinkActiveClass }} onClick={onNavigate}>
						<LinkIcon className="size-4 shrink-0" />
						CardDAV Config
					</Link>
				</div>

				{/* Help & About */}
				<div className="space-y-1">
					<p className={groupLabelClass}>Help &amp; About</p>
					<Link to="/help" className={navLinkClass} activeProps={{ className: navLinkActiveClass }} onClick={onNavigate}>
						<HelpCircle className="size-4 shrink-0" />
						Help
					</Link>
					<Link to="/about" className={navLinkClass} activeProps={{ className: navLinkActiveClass }} onClick={onNavigate}>
						<Info className="size-4 shrink-0" />
						About
					</Link>
				</div>
			</nav>

			<Separator className="bg-sidebar-border" />

			{/* Footer */}
			<div className="flex items-center justify-between px-4 py-3">
				<button
					type="button"
					onClick={() => setSupportOpen(true)}
					className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring/50 focus-visible:ring-[3px]"
					aria-label="Support"
				>
					<Heart className="size-4 shrink-0" />
					<span>Support</span>
				</button>
				<ThemeToggle />
			</div>

			<SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
		</aside>
	)
}

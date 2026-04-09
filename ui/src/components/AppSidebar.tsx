import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
	BookOpen,
	ContactRound,
	Heart,
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
	'flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors'
const navLinkActiveClass =
	'flex items-center gap-3 px-3 py-2 rounded-md text-sm bg-sidebar-accent text-sidebar-accent-foreground font-medium'

interface AppSidebarProps {
	onNavigate?: () => void
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
	const [supportOpen, setSupportOpen] = useState(false)

	return (
		<aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			{/* Branding */}
			<div className="flex items-center gap-2 px-4 py-5">
				<NotebookTabs className="size-5 shrink-0" />
				<span className="text-lg font-semibold">Shared Contacts</span>
			</div>

			<Separator className="bg-sidebar-border" />

			{/* Navigation */}
			<nav className="flex-1 overflow-y-auto px-3 py-4">
				{/* Contacts */}
				<div className="mb-4">
					<p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60">
						Contacts
					</p>
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
					<Link
						to="/import"
						className={navLinkClass}
						activeProps={{ className: navLinkActiveClass }}
						onClick={onNavigate}
					>
						<Upload className="size-4 shrink-0" />
						Import
					</Link>
					<Link
						to="/trash"
						className={navLinkClass}
						activeProps={{ className: navLinkActiveClass }}
						onClick={onNavigate}
					>
						<Trash2 className="size-4 shrink-0" />
						Deleted
					</Link>
				</div>

				{/* Address Books */}
				<div className="mb-4">
					<p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60">
						Address Books
					</p>
					<Link
						to="/books"
						className={navLinkClass}
						activeProps={{ className: navLinkActiveClass }}
						onClick={onNavigate}
					>
						<BookOpen className="size-4 shrink-0" />
						All Books
					</Link>
					<Link
						to="/radicale-users"
						className={navLinkClass}
						activeProps={{ className: navLinkActiveClass }}
						onClick={onNavigate}
					>
						<Users className="size-4 shrink-0" />
						Book Users
					</Link>
					<Link
						to="/carddav-connection"
						className={navLinkClass}
						activeProps={{ className: navLinkActiveClass }}
						onClick={onNavigate}
					>
						<LinkIcon className="size-4 shrink-0" />
						CardDAV Config
					</Link>
				</div>

				{/* About */}
				<div>
					<Link
						to="/about"
						className={navLinkClass}
						activeProps={{ className: navLinkActiveClass }}
						onClick={onNavigate}
					>
						<Info className="size-4 shrink-0" />
						About
					</Link>
				</div>
			</nav>

			<Separator className="bg-sidebar-border" />

			{/* Footer */}
			<div className="flex items-center justify-between px-4 py-3">
				<button
					onClick={() => setSupportOpen(true)}
					className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
					aria-label="Support"
				>
					<Heart className="size-4" />
					<span>Support</span>
				</button>
				<ThemeToggle />
			</div>

			<SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
		</aside>
	)
}

import { useState } from 'react'
import { Menu, NotebookTabs } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { AppSidebar } from './AppSidebar'
import { Button } from './ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'

export function MobileHeader() {
	const [open, setOpen] = useState(false)

	return (
		<header className="flex h-14 items-center gap-2 border-b border-border bg-background px-3 md:hidden">
			<Sheet open={open} onOpenChange={setOpen}>
				<Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
					<Menu className="size-5" />
				</Button>
				<SheetContent className="w-64 p-0">
					<SheetHeader className="sr-only">
						<SheetTitle>Navigation</SheetTitle>
						<SheetDescription>Shared Contacts navigation menu</SheetDescription>
					</SheetHeader>
					<AppSidebar onNavigate={() => setOpen(false)} />
				</SheetContent>
			</Sheet>
			<Link
				to="/"
				search={{ book: undefined }}
				className="flex items-center gap-2 rounded-md px-1 py-1 text-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
			>
				<NotebookTabs className="size-5 shrink-0" />
				<span className="text-base font-semibold tracking-tight">Shared Contacts</span>
			</Link>
		</header>
	)
}

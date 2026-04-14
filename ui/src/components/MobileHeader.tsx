import { useState } from 'react'
import { Menu, NotebookTabs } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { AppSidebar } from './AppSidebar'
import { Button } from './ui/button'
import { Sheet, SheetContent } from './ui/sheet'

export function MobileHeader() {
	const [open, setOpen] = useState(false)

	return (
		<header className="flex items-center gap-3 border-b border-border bg-background p-3 md:hidden">
			<Sheet open={open} onOpenChange={setOpen}>
				<Button variant="ghost" size="icon" className="size-9" onClick={() => setOpen(true)} aria-label="Open menu">
					<Menu className="size-5" />
				</Button>
				<SheetContent className="p-0">
					<AppSidebar onNavigate={() => setOpen(false)} />
				</SheetContent>
			</Sheet>
			<Link to="/" search={{ book: undefined }} className="flex items-center gap-2 text-foreground">
				<NotebookTabs className="size-5" />
				<span className="text-lg font-semibold">Shared Contacts</span>
			</Link>
		</header>
	)
}

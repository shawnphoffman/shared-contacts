import { ExternalLink, Heart } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

interface SupportDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function SupportDialog({ open, onOpenChange }: SupportDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Heart className="size-5 shrink-0 fill-primary text-primary" />
						Support the Trail
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Shared Contacts is free and open source. If it saves you time, consider donating to the Pacific Crest Trail Association.
					</p>

					<a
						href="https://www.pcta.org/donate/"
						target="_blank"
						rel="noopener noreferrer"
						className="group flex items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors outline-none hover:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px]"
					>
						<div>
							<div className="font-medium">Pacific Crest Trail Association</div>
							<div className="text-sm text-muted-foreground">Protecting the PCT from Mexico to Canada</div>
						</div>
						<ExternalLink className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
					</a>

					<div className="space-y-2">
						<div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Support the Developer</div>
						<div className="flex gap-2">
							<Button variant="outline" className="flex-1" asChild>
								<a href="https://ko-fi.com/shawnhoffman" target="_blank" rel="noopener noreferrer">
									Ko-fi
								</a>
							</Button>
							<Button variant="outline" className="flex-1" asChild>
								<a href="https://buymeacoffee.com/shawnhoffman" target="_blank" rel="noopener noreferrer">
									Buy Me a Coffee
								</a>
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}

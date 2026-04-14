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
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-lg">
						<Heart className="w-5 h-5 text-orange-500 fill-orange-500" />
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
						className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent transition-colors group"
					>
						<div>
							<div className="font-medium">Pacific Crest Trail Association</div>
							<div className="text-sm text-muted-foreground">Protecting the PCT from Mexico to Canada</div>
						</div>
						<ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
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

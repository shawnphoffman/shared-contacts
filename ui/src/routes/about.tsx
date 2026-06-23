import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Code, Database, ExternalLink, Github, Heart, Info, Settings } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { PageContainer } from '../components/ui/page-container'
import { PageHeader } from '../components/ui/page-header'

export const Route = createFileRoute('/about')({
	component: AboutPage,
})

interface AboutInfo {
	version: string
	repository: {
		type: string
		url: string
	} | null
	environment: Record<string, string | null>
	nodeVersion: string
	platform: string
	arch: string
}

async function fetchAboutInfo(): Promise<AboutInfo> {
	const response = await fetch('/api/about')
	if (!response.ok) {
		throw new Error('Failed to fetch about information')
	}
	return response.json()
}

function AboutPage() {
	const {
		data: info,
		isLoading,
		error,
	} = useQuery({
		queryKey: ['about'],
		queryFn: fetchAboutInfo,
	})

	const getGitHubUrl = () => {
		if (!info?.repository?.url) return null
		// Convert git URL to GitHub web URL
		const url = info.repository.url
		if (url.startsWith('git+')) {
			return url.replace('git+', '').replace('.git', '')
		}
		if (url.startsWith('git@')) {
			return url.replace('git@github.com:', 'https://github.com/').replace('.git', '')
		}
		if (url.includes('github.com')) {
			return url.replace('.git', '')
		}
		return null
	}

	const githubUrl = info ? getGitHubUrl() : null

	if (isLoading) {
		return (
			<PageContainer width="narrow">
				<div className="mb-6">
					<Skeleton className="h-9 w-32 mb-2" />
					<Skeleton className="h-5 w-64" />
				</div>
				<div className="space-y-6">
					{Array.from({ length: 4 }).map((_, i) => (
						<Card key={i}>
							<CardHeader>
								<Skeleton className="h-6 w-48" />
								<Skeleton className="h-4 w-64" />
							</CardHeader>
							<CardContent className="space-y-3">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
							</CardContent>
						</Card>
					))}
				</div>
			</PageContainer>
		)
	}

	if (error) {
		return (
			<PageContainer width="narrow">
				<div className="text-center text-destructive">
					<p className="text-sm">Error loading about information</p>
					<Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
						Retry
					</Button>
				</div>
			</PageContainer>
		)
	}

	if (!info) {
		return null
	}

	const envVars = Object.entries(info.environment).filter(([_, value]) => value !== null)

	return (
		<PageContainer width="narrow" className="space-y-6">
			<PageHeader title="About" description="Debug information and system details." />

			{/* Version & Repository */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Info className="size-5 text-muted-foreground" />
						Application Information
					</CardTitle>
					<CardDescription>Version and repository information</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<div className="text-xs font-medium text-muted-foreground mb-1">Version</div>
						<div className="font-mono text-sm text-muted-foreground">{info.version}</div>
					</div>
					{githubUrl && (
						<div>
							<div className="text-xs font-medium text-muted-foreground mb-1">Repository</div>
							<Button variant="link" asChild className="h-auto p-0 font-normal">
								<a href={githubUrl} target="_blank" rel="noopener noreferrer">
									{githubUrl}
									<ExternalLink className="size-4" />
								</a>
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			{/* System Information */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Settings className="size-5 text-muted-foreground" />
						System Information
					</CardTitle>
					<CardDescription>Runtime environment details</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<div className="text-xs font-medium text-muted-foreground mb-1">Node.js Version</div>
							<div className="font-mono text-sm text-muted-foreground">{info.nodeVersion}</div>
						</div>
						<div>
							<div className="text-xs font-medium text-muted-foreground mb-1">Platform</div>
							<div className="font-mono text-sm text-muted-foreground">{info.platform}</div>
						</div>
						<div>
							<div className="text-xs font-medium text-muted-foreground mb-1">Architecture</div>
							<div className="font-mono text-sm text-muted-foreground">{info.arch}</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Environment Variables */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Database className="size-5 text-muted-foreground" />
						Environment Variables
					</CardTitle>
					<CardDescription>Configuration and environment settings (sensitive values are masked)</CardDescription>
				</CardHeader>
				<CardContent>
					{envVars.length === 0 ? (
						<div className="text-muted-foreground text-sm">No environment variables configured</div>
					) : (
						<div className="space-y-3">
							{envVars.map(([key, value]) => (
								<div key={key} className="border-b last:border-0 pb-3 last:pb-0">
									<div className="text-xs font-medium text-muted-foreground mb-1">{key}</div>
									<div className="font-mono text-sm text-muted-foreground break-all">{value}</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Additional Info */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Code className="size-5 text-muted-foreground" />
						Additional Information
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-sm text-muted-foreground space-y-2">
						<p>
							Shared Contacts is a self-hostable CardDAV server for managing shared contacts with a modern web-based management interface.
						</p>
						<Separator />
						<p>For issues, feature requests, or contributions, please visit the GitHub repository.</p>
						<Button variant="link" asChild className="h-auto p-0 font-normal text-foreground">
							<a href="https://github.com/shawnphoffman/shared-contacts" target="_blank" rel="noopener noreferrer">
								<Github className="size-4" />
								shawnphoffman/shared-contacts
								<ExternalLink className="size-3" />
							</a>
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Support */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Heart className="size-5 text-primary fill-primary" />
						Support
					</CardTitle>
					<CardDescription>Shared Contacts is free and open source</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<a
						href="https://www.pcta.org/donate/"
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent transition-colors group outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
					>
						<div>
							<div className="font-medium text-sm">Pacific Crest Trail Association</div>
							<div className="text-sm text-muted-foreground">Protecting the PCT from Mexico to Canada</div>
						</div>
						<ExternalLink className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
					</a>

					<Separator />

					<div className="space-y-2">
						<div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Support the Developer</div>
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
							<a
								href="https://ko-fi.com/shawnhoffman"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors text-sm font-medium outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
							>
								Ko-fi
								<ExternalLink className="size-3" />
							</a>
							<a
								href="https://buymeacoffee.com/shawnhoffman"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors text-sm font-medium outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
							>
								Buy Me a Coffee
								<ExternalLink className="size-3" />
							</a>
							<a
								href="https://github.com/sponsors/shawnphoffman"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors text-sm font-medium outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
							>
								GitHub Sponsors
								<ExternalLink className="size-3" />
							</a>
						</div>
					</div>
				</CardContent>
			</Card>
		</PageContainer>
	)
}

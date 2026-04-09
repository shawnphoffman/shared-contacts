import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Code, Database, ExternalLink, Github, Heart, Info, Settings } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'

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
			<div className="container mx-auto p-6 max-w-2xl">
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
			</div>
		)
	}

	if (error) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center text-red-500">
					<p>Error loading about information</p>
					<Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
						Retry
					</Button>
				</div>
			</div>
		)
	}

	if (!info) {
		return null
	}

	const envVars = Object.entries(info.environment).filter(([_, value]) => value !== null)

	return (
		<div className="container mx-auto p-6 max-w-2xl">
			<div className="mb-6">
				<h1 className="text-3xl font-bold mb-2">About</h1>
				<p className="text-muted-foreground">Debug information and system details</p>
			</div>

			<div className="space-y-6">
				{/* Version & Repository */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Info className="w-5 h-5" />
							Application Information
						</CardTitle>
						<CardDescription>Version and repository information</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<div className="text-sm font-medium text-muted-foreground mb-1">Version</div>
							<div className="text-lg font-mono">{info.version}</div>
						</div>
						{githubUrl && (
							<div>
								<div className="text-sm font-medium text-muted-foreground mb-1">Repository</div>
								<a
									href={githubUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
								>
									{githubUrl}
									<ExternalLink className="w-4 h-4" />
								</a>
							</div>
						)}
					</CardContent>
				</Card>

				{/* System Information */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Settings className="w-5 h-5" />
							System Information
						</CardTitle>
						<CardDescription>Runtime environment details</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<div className="text-sm font-medium text-muted-foreground mb-1">Node.js Version</div>
								<div className="font-mono">{info.nodeVersion}</div>
							</div>
							<div>
								<div className="text-sm font-medium text-muted-foreground mb-1">Platform</div>
								<div className="font-mono">{info.platform}</div>
							</div>
							<div>
								<div className="text-sm font-medium text-muted-foreground mb-1">Architecture</div>
								<div className="font-mono">{info.arch}</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Environment Variables */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Database className="w-5 h-5" />
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
										<div className="text-sm font-medium text-muted-foreground mb-1">{key}</div>
										<div className="font-mono text-sm break-all">{value}</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Additional Info */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Code className="w-5 h-5" />
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
								<a
									href="https://github.com/shawnphoffman/shared-contacts"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-2 text-foreground hover:underline"
								>
									<Github className="w-4 h-4" />
									shawnphoffman/shared-contacts
									<ExternalLink className="w-3 h-3" />
								</a>
						</div>
					</CardContent>
				</Card>

					{/* Support */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Heart className="w-5 h-5 text-orange-500 fill-orange-500" />
								Support
							</CardTitle>
							<CardDescription>Shared Contacts is free and open source</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<a
								href="https://www.pcta.org/donate/"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent transition-colors group"
							>
								<div>
									<div className="font-medium">Pacific Crest Trail Association</div>
									<div className="text-sm text-muted-foreground">
										Protecting the PCT from Mexico to Canada
									</div>
								</div>
								<ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
							</a>

							<Separator />

							<div className="space-y-2">
								<div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Support the Developer
								</div>
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
									<a
										href="https://ko-fi.com/shawnhoffman"
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors text-sm font-medium"
									>
										Ko-fi
										<ExternalLink className="w-3 h-3" />
									</a>
									<a
										href="https://buymeacoffee.com/shawnhoffman"
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors text-sm font-medium"
									>
										Buy Me a Coffee
										<ExternalLink className="w-3 h-3" />
									</a>
									<a
										href="https://github.com/sponsors/shawnphoffman"
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors text-sm font-medium"
									>
										GitHub Sponsors
										<ExternalLink className="w-3 h-3" />
									</a>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		)
}

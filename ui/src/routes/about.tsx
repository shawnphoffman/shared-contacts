import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Code, Database, ExternalLink, Info, Settings } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Separator } from '../components/ui/separator'

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
			<div className="container mx-auto p-6">
				<div className="text-center">Loading...</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center text-red-500">Error loading about information</div>
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
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

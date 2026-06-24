import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { AppSidebar } from '../components/AppSidebar'
import { MobileHeader } from '../components/MobileHeader'
import { ThemeProvider } from '../components/ThemeProvider'
import { Button } from '../components/ui/button'
import { Toaster } from '../components/ui/sonner'

import appCss from '../styles.css?url'

import type { ErrorComponentProps } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				title: 'Shared Contacts',
			},
		],
		links: [
			{
				rel: 'stylesheet',
				href: appCss,
			},
			{
				rel: 'icon',
				type: 'image/x-icon',
				href: '/favicon.ico',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon-16x16.png',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/favicon-32x32.png',
			},
			{
				rel: 'apple-touch-icon',
				sizes: '180x180',
				href: '/apple-touch-icon.png',
			},
			{
				rel: 'manifest',
				href: '/site.webmanifest',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '192x192',
				href: '/android-chrome-192x192.png',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '512x512',
				href: '/android-chrome-512x512.png',
			},
		],
	}),

	shellComponent: RootDocument,
	errorComponent: RootErrorBoundary,
})

function RootErrorBoundary({ error }: ErrorComponentProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
			<h1 className="text-lg font-semibold">Something went wrong</h1>
			<p className="text-muted-foreground max-w-md text-sm">{error.message || 'An unexpected error occurred while rendering this page.'}</p>
			<Button variant="outline" onClick={() => window.location.reload()}>
				Reload page
			</Button>
		</div>
	)
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
				<script
					dangerouslySetInnerHTML={{
						__html: `try{var p=localStorage.getItem('phosphor');if(p)document.documentElement.setAttribute('data-phosphor',p)}catch(e){}`,
					}}
				/>
			</head>
			<body>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					// enableSystem
					disableTransitionOnChange
				>
					<div className="flex h-screen overflow-hidden">
						{/* Desktop sidebar */}
						<aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-sidebar-border">
							<AppSidebar />
						</aside>

						{/* Main content area */}
						<div className="flex flex-1 flex-col overflow-hidden">
							<MobileHeader />
							<main className="flex-1 overflow-y-auto">{children}</main>
						</div>
					</div>
					<Toaster />
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	)
}

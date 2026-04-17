import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'

// ── Types ──────────────────────────────────────────────────────────

export interface RuntimeConfig {
	uiBaseUrl: string | null
	carddavBaseUrl: string | null
}

export interface RadicaleUser {
	username: string
}

export interface UserBookAssignments {
	assignments: Record<string, Array<string>>
	public_book_ids: Array<string>
}

// ── Fetch helpers ──────────────────────────────────────────────────

export async function fetchRuntimeConfig(): Promise<RuntimeConfig> {
	const response = await fetch('/api/runtime-config')
	if (!response.ok) {
		throw new Error('Failed to fetch runtime config')
	}
	return response.json()
}

export async function fetchUsers(): Promise<Array<RadicaleUser>> {
	const response = await fetch('/api/radicale-users')
	if (!response.ok) {
		throw new Error('Failed to fetch users')
	}
	return response.json()
}

export async function fetchUserBookAssignments(): Promise<UserBookAssignments> {
	const response = await fetch('/api/user-book-assignments')
	if (!response.ok) {
		throw new Error('Failed to fetch user-book assignments')
	}
	return response.json()
}

// ── URL helpers ────────────────────────────────────────────────────

export function getDirectCardDAVBaseUrl(): string {
	if (typeof window !== 'undefined') {
		const { hostname } = window.location
		return `http://${hostname}:5232`
	}
	return 'http://localhost:5232'
}

export function getDirectUIBaseUrl(): string {
	if (typeof window !== 'undefined') {
		const { hostname } = window.location
		return `http://${hostname}:3030`
	}
	return 'http://localhost:3030'
}

export function getProxyCardDAVBaseUrl(runtimeConfig?: RuntimeConfig): string {
	if (runtimeConfig?.carddavBaseUrl) {
		return runtimeConfig.carddavBaseUrl
	}
	if (typeof window !== 'undefined') {
		const { protocol, hostname } = window.location
		return `${protocol}//${hostname}:5232`
	}
	return 'https://carddav.example.com'
}

export function getProxyUIBaseUrl(runtimeConfig?: RuntimeConfig): string {
	if (runtimeConfig?.uiBaseUrl) {
		return runtimeConfig.uiBaseUrl
	}
	if (typeof window !== 'undefined') {
		const { protocol, hostname } = window.location
		return `${protocol}//${hostname}:3030`
	}
	return 'https://contacts.example.com'
}

/** CardDAV subscription URL for a user and address book (uses composite username format: username-bookid). */
export function getCardDAVUrl(username: string, bookId: string, baseUrl: string): string {
	const compositeUsername = `${username}-${bookId}`
	return `${baseUrl}/${encodeURIComponent(compositeUsername)}/`
}

// ── Actions ────────────────────────────────────────────────────────

export async function handleDownloadMobileconfig(username: string, bookId: string, bookName: string) {
	try {
		const params = new URLSearchParams({
			username,
			bookId,
		})
		const response = await fetch(`/api/mobileconfig?${params.toString()}`)

		if (!response.ok) {
			let message = 'Failed to download profile'
			try {
				const data = await response.json()
				if (data?.error) {
					message = data.error
				}
			} catch {
				// Ignore JSON parsing errors and use default message
			}
			toast.error(message)
			return
		}

		const blob = await response.blob()
		const url = window.URL.createObjectURL(blob)
		const link = document.createElement('a')
		const shortBookId = bookId.replace(/-/g, '').slice(0, 8) || bookId

		link.href = url
		link.download = `shared-contacts-${username}-${shortBookId}.mobileconfig`

		document.body.appendChild(link)
		link.click()
		link.remove()
		window.URL.revokeObjectURL(url)

		toast.success(`Profile for "${bookName}" is downloading`)
	} catch (error) {
		console.error('Error downloading mobileconfig profile:', error)
		toast.error('Failed to download profile')
	}
}

export async function handleDownloadCombinedMobileconfig(username: string) {
	try {
		const params = new URLSearchParams({ username, combined: '1' })
		const response = await fetch(`/api/mobileconfig?${params.toString()}`)

		if (!response.ok) {
			let message = 'Failed to download profile'
			try {
				const data = await response.json()
				if (data?.error) {
					message = data.error
				}
			} catch {
				// Ignore JSON parsing errors and use default message
			}
			toast.error(message)
			return
		}

		const blob = await response.blob()
		const url = window.URL.createObjectURL(blob)
		const link = document.createElement('a')
		const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_')

		link.href = url
		link.download = `shared-contacts-${safeUsername}-all.mobileconfig`

		document.body.appendChild(link)
		link.click()
		link.remove()
		window.URL.revokeObjectURL(url)

		toast.success(`Combined profile for "${username}" is downloading`)
	} catch (error) {
		console.error('Error downloading combined mobileconfig profile:', error)
		toast.error('Failed to download combined profile')
	}
}

// ── Components ─────────────────────────────────────────────────────

export function CopyButton({ text, label }: { text: string; label: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	return (
		<Button variant="outline" size="sm" onClick={handleCopy} title={`Copy ${label}`}>
			{copied ? (
				<>
					<Check className="size-4" />
					Copied
				</>
			) : (
				<>
					<Copy className="size-4" />
					Copy
				</>
			)}
		</Button>
	)
}

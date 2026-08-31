/** Short, glanceable ages for status text: "just now", "4m ago", "2h ago", "3d ago". */
export function formatRelativeTime(value: string | Date | null | undefined, now: number = Date.now()): string | null {
	if (!value) return null
	const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
	if (Number.isNaN(timestamp)) return null

	const seconds = Math.round((now - timestamp) / 1000)
	// A clock skew between the browser and the server should not read as the
	// future; treat anything ahead of now as just now.
	if (seconds < 45) return 'just now'
	const minutes = Math.round(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.round(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.round(hours / 24)
	if (days < 30) return `${days}d ago`
	const months = Math.round(days / 30)
	if (months < 12) return `${months}mo ago`
	return `${Math.round(months / 12)}y ago`
}

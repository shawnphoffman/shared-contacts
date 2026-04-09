export const RADICALE_STORAGE_PATH = '/data/collections'
export const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '30000', 10) // Default 30 seconds instead of 5
export const FILE_WATCHER_DEBOUNCE_MS = parseInt(process.env.FILE_WATCHER_DEBOUNCE_MS || '2000', 10) // Debounce file changes for 2 seconds

export const getErrorCode = (error: unknown): string | undefined => {
	if (error instanceof Error && 'code' in error) {
		return (error as NodeJS.ErrnoException).code
	}
	return undefined
}

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AppPackageInfo {
	version: string | null
	repository: unknown
}

/**
 * Locate the repo-root package.json, which is copied next to the built app in
 * the Docker image. Layout differs between running from `ui/` in development
 * and `/app/ui` in the image, so probe the plausible spots.
 */
export function readAppPackageInfo(): AppPackageInfo {
	const candidates = [
		join(process.cwd(), '..', 'package.json'), // repo root, running from ui/
		join(process.cwd(), 'package.json'), // current directory
		join(process.cwd(), '..', '..', 'package.json'), // if nested deeper
	]

	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue
		try {
			const parsed = JSON.parse(readFileSync(candidate, 'utf-8'))
			return {
				version: typeof parsed.version === 'string' ? parsed.version : null,
				repository: parsed.repository ?? null,
			}
		} catch {
			// Malformed or unreadable — try the next candidate.
		}
	}

	return { version: null, repository: null }
}

export function getAppVersion(): string | null {
	return readAppPackageInfo().version
}

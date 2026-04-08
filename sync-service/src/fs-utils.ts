import * as fs from 'fs'
import { writeFile, rename, unlink } from 'fs/promises'

/**
 * Simple in-memory async mutex for serializing access to shared resources.
 * Suitable for single-process Node.js applications (no cross-process locking).
 */
export class AsyncMutex {
	private locked = false
	private queue: Array<() => void> = []

	async acquire(): Promise<void> {
		if (!this.locked) {
			this.locked = true
			return
		}
		return new Promise<void>(resolve => this.queue.push(resolve))
	}

	release(): void {
		const next = this.queue.shift()
		if (next) {
			next()
		} else {
			this.locked = false
		}
	}

	async withLock<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire()
		try {
			return await fn()
		} finally {
			this.release()
		}
	}
}

/**
 * Write a file atomically by writing to a temp file then renaming.
 * The rename is atomic on POSIX when source and destination are on
 * the same filesystem (guaranteed here since the temp file is in
 * the same directory as the target).
 */
export function atomicWriteFileSync(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): void {
	const tmpPath = `${filePath}.tmp.${process.pid}`
	try {
		fs.writeFileSync(tmpPath, content, encoding)
		fs.renameSync(tmpPath, filePath)
	} catch (error) {
		try {
			fs.unlinkSync(tmpPath)
		} catch {
			// Ignore cleanup errors
		}
		throw error
	}
}

/**
 * Async version of atomicWriteFileSync.
 */
export async function atomicWriteFile(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
	const tmpPath = `${filePath}.tmp.${process.pid}`
	try {
		await writeFile(tmpPath, content, encoding)
		await rename(tmpPath, filePath)
	} catch (error) {
		try {
			await unlink(tmpPath)
		} catch {
			// Ignore cleanup errors
		}
		throw error
	}
}

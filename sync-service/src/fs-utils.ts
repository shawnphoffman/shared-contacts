import * as fs from 'fs'
import { writeFile, rename, unlink } from 'fs/promises'

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

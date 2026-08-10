import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createTar, createTarGz } from './tar'

const BLOCK_SIZE = 512

interface ParsedEntry {
	name: string
	mode: number
	size: number
	typeflag: string
	data: Buffer
}

/**
 * Independent reader used only by these tests, so a bug shared between writer
 * and reader can't hide. Cross-checked against the system `tar` below.
 */
function parseTar(archive: Buffer): Array<ParsedEntry> {
	const entries: Array<ParsedEntry> = []
	let offset = 0

	while (offset + BLOCK_SIZE <= archive.length) {
		const header = archive.subarray(offset, offset + BLOCK_SIZE)
		if (header.every(byte => byte === 0)) break

		// Verify the checksum the way tar does: sum every byte with the checksum
		// field read as spaces.
		const stated = parseInt(header.subarray(148, 156).toString('ascii').replace(/\0.*$/, '').trim(), 8)
		const forChecksum = Buffer.from(header)
		forChecksum.fill(0x20, 148, 156)
		let actual = 0
		for (const byte of forChecksum) actual += byte
		expect(actual).toBe(stated)

		expect(header.subarray(257, 262).toString('ascii')).toBe('ustar')

		const name = header.subarray(0, 100).toString('utf-8').replace(/\0.*$/, '')
		const mode = parseInt(header.subarray(100, 108).toString('ascii').replace(/\0.*$/, ''), 8)
		const size = parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, ''), 8)
		const typeflag = String.fromCharCode(header[156])

		offset += BLOCK_SIZE
		const data = archive.subarray(offset, offset + size)
		offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE

		entries.push({ name, mode, size, typeflag, data: Buffer.from(data) })
	}

	return entries
}

function hasSystemTar(): boolean {
	try {
		execFileSync('tar', ['--version'], { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
}

describe('createTar', () => {
	it('round-trips files and directories', () => {
		const mtime = new Date('2026-08-10T12:00:00Z')
		const archive = createTar([
			{ name: 'backup', directory: true, mtime },
			{ name: 'backup/notes.txt', data: 'hello world', mtime },
			{ name: 'backup/photo.bin', data: Buffer.from([0, 1, 2, 255, 254]), mtime },
		])

		const entries = parseTar(archive)
		expect(entries.map(entry => entry.name)).toEqual(['backup/', 'backup/notes.txt', 'backup/photo.bin'])
		expect(entries[0].typeflag).toBe('5')
		expect(entries[0].mode).toBe(0o755)
		expect(entries[1].typeflag).toBe('0')
		expect(entries[1].mode).toBe(0o644)
		expect(entries[1].data.toString('utf-8')).toBe('hello world')
		expect([...entries[2].data]).toEqual([0, 1, 2, 255, 254])
	})

	it('pads entries to 512-byte blocks and ends with two zero blocks', () => {
		// 1 header + 1 data block + 2 end blocks.
		const archive = createTar([{ name: 'a.txt', data: 'x' }])
		expect(archive.length).toBe(BLOCK_SIZE * 4)
		expect(archive.subarray(BLOCK_SIZE * 2).every(byte => byte === 0)).toBe(true)
	})

	it('handles content that is an exact multiple of the block size', () => {
		const data = Buffer.alloc(BLOCK_SIZE * 2, 0x41)
		const archive = createTar([{ name: 'exact.bin', data }])
		expect(archive.length).toBe(BLOCK_SIZE * 5)
		expect(parseTar(archive)[0].data.equals(data)).toBe(true)
	})

	it('preserves multi-byte UTF-8 content', () => {
		const text = 'Renée Ω 日本語 🎉'
		const entries = parseTar(createTar([{ name: 'utf8.txt', data: text }]))
		expect(entries[0].size).toBe(Buffer.byteLength(text, 'utf-8'))
		expect(entries[0].data.toString('utf-8')).toBe(text)
	})

	it('rejects names too long for the ustar name field', () => {
		expect(() => createTar([{ name: 'a'.repeat(101), data: 'x' }])).toThrow(/exceeds 100 bytes/)
	})
})

describe('createTarGz', () => {
	it('produces a gzip stream that decompresses to the tar', () => {
		const entries = [{ name: 'backup/notes.txt', data: 'compress me' }]
		expect(gunzipSync(createTarGz(entries)).equals(createTar(entries))).toBe(true)
	})

	it.runIf(hasSystemTar())('is readable by the system tar', () => {
		const dir = mkdtempSync(join(tmpdir(), 'tar-test-'))
		try {
			const archivePath = join(dir, 'archive.tar.gz')
			writeFileSync(
				archivePath,
				createTarGz([
					{ name: 'backup', directory: true },
					{ name: 'backup/notes.txt', data: 'hello world' },
					{ name: 'backup/nested.json', data: '{"ok":true}' },
				])
			)

			const listing = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf-8' })
			expect(listing.split('\n').filter(Boolean).sort()).toEqual(['backup/', 'backup/nested.json', 'backup/notes.txt'])

			execFileSync('tar', ['-xzf', archivePath, '-C', dir])
			expect(execFileSync('cat', [join(dir, 'backup', 'notes.txt')], { encoding: 'utf-8' })).toBe('hello world')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})

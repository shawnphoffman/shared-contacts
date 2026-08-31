import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * Minimal reader/writer for the ustar subset we need: a handful of small regular
 * files under one directory, with short ASCII names. Deliberately not a
 * general-purpose tar implementation — anything it can't represent exactly
 * (long names, huge files, links, sparse files) throws rather than silently
 * producing a broken archive.
 *
 * Written in-tree instead of pulling in a tar dependency: the format subset is
 * ~100 lines, and the archives are small enough to build in memory.
 */

const BLOCK_SIZE = 512
const NAME_FIELD_SIZE = 100
/** Largest size representable in the 11-octal-digit size field: 8 GiB - 1. */
const MAX_ENTRY_BYTES = 0o77777777777

const TYPE_FILE = 0x30 // '0'
const TYPE_DIRECTORY = 0x35 // '5'

export interface TarEntry {
	/** Path inside the archive, e.g. `my-backup/snapshot.json`. */
	name: string
	/** File contents. Strings are encoded as UTF-8. Ignored for directories. */
	data?: Buffer | string
	/** Unix mode. Defaults to 0644 for files, 0755 for directories. */
	mode?: number
	/** Modification time recorded in the header. Defaults to now. */
	mtime?: Date
	/** Emit a directory entry (no contents) instead of a regular file. */
	directory?: boolean
}

function toBuffer(data: Buffer | string | undefined): Buffer {
	if (data === undefined) return Buffer.alloc(0)
	return Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8')
}

function writeAscii(block: Buffer, value: string, offset: number, size: number): void {
	const bytes = Buffer.from(value, 'utf-8')
	if (bytes.length > size) {
		throw new RangeError(`tar field at offset ${offset} holds ${size} bytes, got ${bytes.length} ("${value}")`)
	}
	bytes.copy(block, offset)
}

/**
 * Numeric ustar fields are octal text, zero-padded, NUL-terminated — so a
 * size-N field carries N-1 digits.
 */
function writeOctal(block: Buffer, value: number, offset: number, size: number): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new RangeError(`tar numeric field at offset ${offset} must be a non-negative integer, got ${value}`)
	}
	const text = value.toString(8).padStart(size - 1, '0')
	if (text.length > size - 1) {
		throw new RangeError(`tar numeric field at offset ${offset} overflows ${size - 1} octal digits (value ${value})`)
	}
	block.write(text, offset, 'ascii')
	block[offset + size - 1] = 0
}

function buildHeader(entry: TarEntry, data: Buffer): Buffer {
	const header = Buffer.alloc(BLOCK_SIZE)

	// Directory entries are conventionally stored with a trailing slash.
	const name = entry.directory && !entry.name.endsWith('/') ? `${entry.name}/` : entry.name
	if (Buffer.byteLength(name, 'utf-8') > NAME_FIELD_SIZE) {
		throw new RangeError(`tar entry name exceeds ${NAME_FIELD_SIZE} bytes: "${name}"`)
	}
	if (data.length > MAX_ENTRY_BYTES) {
		throw new RangeError(`tar entry "${name}" is ${data.length} bytes, over the ${MAX_ENTRY_BYTES} byte ustar limit`)
	}

	writeAscii(header, name, 0, NAME_FIELD_SIZE)
	writeOctal(header, entry.mode ?? (entry.directory ? 0o755 : 0o644), 100, 8)
	writeOctal(header, 0, 108, 8) // uid
	writeOctal(header, 0, 116, 8) // gid
	writeOctal(header, data.length, 124, 12)
	writeOctal(header, Math.floor((entry.mtime ?? new Date()).getTime() / 1000), 136, 12)

	// The checksum is computed over the whole header with the checksum field
	// itself read as eight spaces, so fill it before summing.
	header.fill(0x20, 148, 156)
	header[156] = entry.directory ? TYPE_DIRECTORY : TYPE_FILE
	writeAscii(header, 'ustar', 257, 6) // magic, NUL-terminated by the zero fill
	writeAscii(header, '00', 263, 2) // version
	writeAscii(header, 'root', 265, 32) // uname
	writeAscii(header, 'root', 297, 32) // gname

	let sum = 0
	for (const byte of header) sum += byte
	// Checksum is six octal digits, then NUL, then a space.
	header.write(sum.toString(8).padStart(6, '0'), 148, 'ascii')
	header[154] = 0
	header[155] = 0x20

	return header
}

/** Build an uncompressed tar archive from the given entries. */
export function createTar(entries: Array<TarEntry>): Buffer {
	const chunks: Array<Buffer> = []

	for (const entry of entries) {
		const data = entry.directory ? Buffer.alloc(0) : toBuffer(entry.data)
		chunks.push(buildHeader(entry, data))
		if (data.length > 0) {
			chunks.push(data)
			const remainder = data.length % BLOCK_SIZE
			if (remainder !== 0) chunks.push(Buffer.alloc(BLOCK_SIZE - remainder))
		}
	}

	// End of archive is two zero-filled blocks.
	chunks.push(Buffer.alloc(BLOCK_SIZE * 2))
	return Buffer.concat(chunks)
}

/** Build a gzipped tar archive. */
export function createTarGz(entries: Array<TarEntry>): Buffer {
	return gzipSync(createTar(entries), { level: 9 })
}

export interface TarFile {
	name: string
	data: Buffer
}

function readAscii(block: Buffer, offset: number, size: number): string {
	const field = block.subarray(offset, offset + size)
	const end = field.indexOf(0)
	return field
		.subarray(0, end === -1 ? field.length : end)
		.toString('utf-8')
		.trim()
}

function readOctal(block: Buffer, offset: number, size: number): number {
	const text = readAscii(block, offset, size)
	if (text === '') return 0
	const value = parseInt(text, 8)
	if (!Number.isFinite(value)) throw new Error(`Malformed tar numeric field at offset ${offset}`)
	return value
}

/**
 * Read the regular files out of an uncompressed tar archive, in archive order.
 * Directory entries are skipped. Anything outside the subset createTar writes
 * (long-name extensions, links, sparse files) is rejected rather than guessed
 * at, so a foreign archive fails loudly instead of restoring nonsense.
 */
export function readTar(archive: Buffer): Array<TarFile> {
	const files: Array<TarFile> = []
	let offset = 0

	while (offset + BLOCK_SIZE <= archive.length) {
		const header = archive.subarray(offset, offset + BLOCK_SIZE)
		// Two zero blocks end the archive; one is enough to stop on.
		if (header.every(byte => byte === 0)) break

		const name = readAscii(header, 0, NAME_FIELD_SIZE)
		const size = readOctal(header, 124, 12)
		const type = header[156]
		offset += BLOCK_SIZE

		if (type !== TYPE_FILE && type !== TYPE_DIRECTORY && type !== 0) {
			throw new Error(`Unsupported tar entry type ${String.fromCharCode(type)} for "${name}"`)
		}
		if (offset + size > archive.length) {
			throw new Error(`Truncated tar entry "${name}": wanted ${size} bytes`)
		}

		if (type !== TYPE_DIRECTORY && !name.endsWith('/')) {
			files.push({ name, data: archive.subarray(offset, offset + size) })
		}

		offset += size
		const remainder = size % BLOCK_SIZE
		if (remainder !== 0) offset += BLOCK_SIZE - remainder
	}

	return files
}

/** Read the regular files out of a gzipped tar archive. */
export function readTarGz(archive: Buffer): Array<TarFile> {
	return readTar(gunzipSync(archive))
}

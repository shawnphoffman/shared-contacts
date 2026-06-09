#!/usr/bin/env node
/**
 * check-birthday-offsets.mjs  (READ-ONLY)
 *
 * Detects birthdays that were corrupted by the historical CSV-import timezone
 * off-by-one bug: a date-only value (e.g. 1978-09-03) parsed via `new Date()`
 * became midnight UTC, then was read back with local-timezone getters, shifting
 * it one day earlier in timezones behind UTC.
 *
 * It compares the original source CSV (the known-good birthdays) against what is
 * currently stored, both in the `birthday` DATE column and in the BDAY line of
 * each contact's `vcard_data`. It never writes anything.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/check-birthday-offsets.mjs [path/to/original.csv]
 *
 * Default CSV path: private/contacts_import.csv
 * Exit code: 0 if no off-by-one corruption found, 1 if any was found.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

// Repo root is one level up from this script's directory, so paths and module
// resolution work no matter where the script is invoked from.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// `pg` is installed in the workspaces, not at the repo root. Resolve it from
// whichever workspace has it.
const require = createRequire(import.meta.url)
let pgPath
for (const ws of ['ui', 'sync-service']) {
	try {
		pgPath = require.resolve('pg', { paths: [join(REPO_ROOT, ws, 'node_modules')] })
		break
	} catch {
		// try next workspace
	}
}
if (!pgPath) {
	console.error('ERROR: could not find the "pg" package. Run `npm install` in ui/ or sync-service/ first.')
	process.exit(2)
}
const pg = (await import(pathToFileURL(pgPath).href)).default

const CSV_PATH = process.argv[2] ? resolve(process.argv[2]) : join(REPO_ROOT, 'private/contacts_import.csv')

// --- tiny CSV parser (handles quoted fields and escaped quotes) ---
function parseCsv(text) {
	const rows = []
	let row = []
	let field = ''
	let inQuotes = false
	for (let i = 0; i < text.length; i++) {
		const c = text[i]
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"'
					i++
				} else {
					inQuotes = false
				}
			} else {
				field += c
			}
		} else if (c === '"') {
			inQuotes = true
		} else if (c === ',') {
			row.push(field)
			field = ''
		} else if (c === '\n') {
			row.push(field)
			rows.push(row)
			row = []
			field = ''
		} else if (c === '\r') {
			// ignore; handled by \n
		} else {
			field += c
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field)
		rows.push(row)
	}
	return rows
}

// Normalize any supported birthday form to "YYYY-MM-DD", else null.
function normalizeBirthday(value) {
	if (!value) return null
	const v = String(value).trim()
	if (!v) return null
	let m
	if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/))) return `${m[1]}-${m[2]}-${m[3]}`
	if ((m = v.match(/^(\d{4})(\d{2})(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`
	if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
		return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
	}
	return null
}

// Whole-day difference: a - b, in days. Uses UTC so DST never interferes.
function dayDiff(a, b) {
	const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
	const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
	return Math.round((da - db) / 86400000)
}

function bdayFromVcard(vcard) {
	if (!vcard) return null
	const m = vcard.match(/^BDAY[^:]*:(.+)$/im)
	return m ? normalizeBirthday(m[1].trim()) : null
}

const norm = s => (s || '').toString().trim().toLowerCase()

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error('ERROR: DATABASE_URL is not set. Example:')
		console.error('  DATABASE_URL=postgres://user:pass@localhost:5432/sharedcontacts node scripts/check-birthday-offsets.mjs')
		process.exit(2)
	}

	// --- read original CSV ---
	const csvRows = parseCsv(readFileSync(resolve(CSV_PATH), 'utf8'))
	const header = csvRows.shift().map(h => h.trim().toLowerCase())
	const col = name => header.indexOf(name)
	const iBday = col('bday')
	const iFirst = col('first')
	const iLast = col('last')
	const iEmail = col('email')

	const originals = []
	for (const r of csvRows) {
		const bday = normalizeBirthday(r[iBday])
		if (!bday) continue
		const first = r[iFirst] || ''
		const last = r[iLast] || ''
		originals.push({
			fullName: `${first} ${last}`.trim(),
			nameKey: norm(`${first} ${last}`),
			emailKey: norm(r[iEmail]),
			bday,
		})
	}

	// --- read current DB state (DATE returned as raw string) ---
	pg.types.setTypeParser(pg.types.builtins.DATE, v => v)
	const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
	const { rows: contacts } = await pool.query(
		`SELECT id, full_name, first_name, last_name, email, emails, birthday, vcard_data
		 FROM contacts WHERE deleted_at IS NULL`
	)
	await pool.end()

	// index DB contacts by name and by email
	const byName = new Map()
	const byEmail = new Map()
	for (const c of contacts) {
		const nameKey = norm(c.full_name || `${c.first_name || ''} ${c.last_name || ''}`)
		if (nameKey && !byName.has(nameKey)) byName.set(nameKey, c)
		const emails = [c.email, ...(Array.isArray(c.emails) ? c.emails.map(e => e?.value) : [])]
		for (const e of emails) {
			const k = norm(e)
			if (k && !byEmail.has(k)) byEmail.set(k, c)
		}
	}

	const buckets = { offByOne: [], otherMismatch: [], notFound: [], noStored: [], ok: [] }

	for (const o of originals) {
		const c = (o.nameKey && byName.get(o.nameKey)) || (o.emailKey && byEmail.get(o.emailKey)) || null
		if (!c) {
			buckets.notFound.push(o)
			continue
		}
		const stored = normalizeBirthday(c.birthday)
		const vcardBday = bdayFromVcard(c.vcard_data)
		const entry = { name: o.fullName, original: o.bday, stored, vcardBday, id: c.id }

		if (!stored && !vcardBday) {
			buckets.noStored.push(entry)
			continue
		}
		// off-by-one if the stored value (column or vCard) is exactly 1 day earlier
		const candidates = [stored, vcardBday].filter(Boolean)
		const offBy = candidates.map(s => dayDiff(o.bday, s))
		if (offBy.some(d => d === 1)) buckets.offByOne.push(entry)
		else if (offBy.some(d => d !== 0)) buckets.otherMismatch.push(entry)
		else buckets.ok.push(entry)
	}

	// --- report ---
	const pr = (e, label) =>
		console.log(`  - ${e.name} [${e.id}]: ${label} (csv=${e.original}, db=${e.stored ?? '-'}, vcard=${e.vcardBday ?? '-'})`)

	console.log(`\nBirthday off-by-one report (source: ${CSV_PATH})`)
	console.log(`Originals with a birthday: ${originals.length} | DB contacts scanned: ${contacts.length}\n`)

	console.log(`OFF BY ONE (likely corrupted): ${buckets.offByOne.length}`)
	buckets.offByOne.forEach(e => pr(e, 'shifted -1 day'))

	console.log(`\nOTHER MISMATCH (differs, but not by one day): ${buckets.otherMismatch.length}`)
	buckets.otherMismatch.forEach(e => pr(e, 'mismatch'))

	console.log(`\nNO STORED BIRTHDAY (in CSV but missing in DB/vCard): ${buckets.noStored.length}`)
	buckets.noStored.forEach(e => pr(e, 'missing'))

	console.log(`\nNOT MATCHED to a DB contact: ${buckets.notFound.length}`)
	buckets.notFound.forEach(o => console.log(`  - ${o.fullName} (csv=${o.bday})`))

	console.log(`\nOK (matches): ${buckets.ok.length}`)
	console.log('\nNothing was modified. This script is read-only.\n')

	process.exit(buckets.offByOne.length > 0 ? 1 : 0)
}

main().catch(err => {
	console.error('Failed:', err.message)
	process.exit(2)
})

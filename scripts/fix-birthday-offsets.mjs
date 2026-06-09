#!/usr/bin/env node
/**
 * fix-birthday-offsets.mjs
 *
 * Repairs birthdays corrupted by the historical CSV-import timezone off-by-one
 * bug. It is intentionally conservative:
 *
 *   - It ONLY touches a contact whose currently-stored birthday is EXACTLY one
 *     day earlier than the original CSV value (the bug's fingerprint). Anything
 *     that differs by more than a day, matches already, or isn't in the CSV is
 *     reported and left untouched - so birthdays legitimately changed since the
 *     import are never clobbered.
 *   - It DEFAULTS TO DRY-RUN. It writes nothing unless you pass --apply.
 *   - When applying, it re-reads each row inside a transaction (FOR UPDATE) and
 *     re-checks the fingerprint before writing, so a concurrent edit can't be
 *     overwritten.
 *
 * For each repaired contact it: corrects the `birthday` DATE column, surgically
 * rewrites only the `BDAY:` line inside `vcard_data` (preserving everything
 * else), and sets `last_synced_to_radicale_at = NULL` so the corrected vCard is
 * re-synced out to CardDAV/devices.
 *
 * IMPORTANT: deploy the code fix (string-based birthday handling) first, so the
 * app doesn't re-introduce the shift on subsequent imports or syncs.
 *
 * Usage (dry-run):
 *   DATABASE_URL=postgres://... node scripts/fix-birthday-offsets.mjs [path/to/original.csv]
 * Apply for real:
 *   DATABASE_URL=postgres://... node scripts/fix-birthday-offsets.mjs [path/to/original.csv] --apply
 *
 * Default CSV path: private/contacts_import.csv
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APPLY = process.argv.includes('--apply')
const csvArg = process.argv.slice(2).find(a => !a.startsWith('--'))
const CSV_PATH = csvArg ? resolve(csvArg) : join(REPO_ROOT, 'private/contacts_import.csv')

// Resolve `pg` from whichever workspace has it (works at /app/scripts in the
// production container, and in the repo locally).
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
	console.error('ERROR: could not find the "pg" package. Run this inside the app container or after `npm install`.')
	process.exit(2)
}
const pg = (await import(pathToFileURL(pgPath).href)).default

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
				} else inQuotes = false
			} else field += c
		} else if (c === '"') inQuotes = true
		else if (c === ',') {
			row.push(field)
			field = ''
		} else if (c === '\n') {
			row.push(field)
			rows.push(row)
			row = []
			field = ''
		} else if (c !== '\r') field += c
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field)
		rows.push(row)
	}
	return rows
}

function normalizeBirthday(value) {
	if (!value) return null
	const v = String(value).trim()
	if (!v) return null
	let m
	if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/))) return `${m[1]}-${m[2]}-${m[3]}`
	if ((m = v.match(/^(\d{4})(\d{2})(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`
	if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
	return null
}

// a - b in whole days, computed in UTC so DST never interferes.
function dayDiff(a, b) {
	const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
	const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
	return Math.round((da - db) / 86400000)
}

// Locate the BDAY line and pull its normalized value. Returns { raw, value } or null.
function extractBday(vcard) {
	if (!vcard) return null
	const m = vcard.match(/^(BDAY[^:\r\n]*:)([^\r\n]*)/im)
	if (!m) return null
	return { prefix: m[1], rawValue: m[2].trim(), value: normalizeBirthday(m[2]) }
}

// Rewrite only the BDAY value in vcard_data to `correct` (YYYY-MM-DD), keeping
// the original delimiter style (dashed vs compact). Returns the new vcard string,
// or null if there is no BDAY line to rewrite.
function rewriteBday(vcard, correct) {
	const b = extractBday(vcard)
	if (!b) return null
	const compact = `${correct.slice(0, 4)}${correct.slice(5, 7)}${correct.slice(8, 10)}`
	const replacement = b.rawValue.includes('-') ? correct : compact
	return vcard.replace(/^(BDAY[^:\r\n]*:)([^\r\n]*)/im, `$1${replacement}`)
}

const norm = s => (s || '').toString().trim().toLowerCase()

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error('ERROR: DATABASE_URL is not set.')
		process.exit(2)
	}

	const csvRows = parseCsv(readFileSync(CSV_PATH, 'utf8'))
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

	pg.types.setTypeParser(pg.types.builtins.DATE, v => v)
	const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
	const { rows: contacts } = await pool.query(
		`SELECT id, full_name, first_name, last_name, email, emails, birthday, vcard_data
		 FROM contacts WHERE deleted_at IS NULL`
	)

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

	const toFix = [] // { id, name, correct, oldColumn, oldVcardBday, needsVcardRegen }
	const skipped = [] // { name, reason, ... }

	for (const o of originals) {
		const c = (o.nameKey && byName.get(o.nameKey)) || (o.emailKey && byEmail.get(o.emailKey)) || null
		if (!c) {
			skipped.push({ name: o.fullName, reason: 'not matched to a DB contact', csv: o.bday })
			continue
		}
		const column = normalizeBirthday(c.birthday)
		const vb = extractBday(c.vcard_data)
		const vcardBday = vb?.value || null

		const columnOff = column && dayDiff(o.bday, column) === 1
		const vcardOff = vcardBday && dayDiff(o.bday, vcardBday) === 1

		if (!columnOff && !vcardOff) {
			// Not the off-by-one fingerprint. Report mismatches so they can be eyeballed.
			const differs = (column && column !== o.bday) || (vcardBday && vcardBday !== o.bday)
			if (differs)
				skipped.push({
					name: o.fullName,
					reason: 'differs but not by one day (changed since import?) - left untouched',
					csv: o.bday,
					column,
					vcardBday,
				})
			continue
		}

		toFix.push({
			id: c.id,
			name: o.fullName,
			correct: o.bday,
			oldColumn: column,
			oldVcardBday: vcardBday,
			// If there's no BDAY line we can't surgically patch; fall back to regen.
			needsVcardRegen: !!c.vcard_data && !vb,
		})
	}

	console.log(`\nBirthday off-by-one REPAIR ${APPLY ? '(APPLY)' : '(DRY-RUN - no writes)'} | source: ${CSV_PATH}`)
	console.log(`DB contacts: ${contacts.length} | CSV birthdays: ${originals.length} | to fix: ${toFix.length}\n`)

	for (const f of toFix) {
		const note = f.needsVcardRegen ? ' [no BDAY line: vcard_data will be regenerated from fields]' : ''
		console.log(`  FIX ${f.name} [${f.id}]: ${f.oldColumn ?? '-'} / vcard ${f.oldVcardBday ?? '-'}  ->  ${f.correct}${note}`)
	}

	if (skipped.length) {
		console.log(`\nLeft untouched (${skipped.length}):`)
		for (const s of skipped) {
			const extra = s.column !== undefined ? ` (csv=${s.csv}, db=${s.column ?? '-'}, vcard=${s.vcardBday ?? '-'})` : ` (csv=${s.csv})`
			console.log(`  - ${s.name}: ${s.reason}${extra}`)
		}
	}

	if (!APPLY) {
		console.log(`\nDry-run only. Re-run with --apply to write the ${toFix.length} fix(es).\n`)
		await pool.end()
		process.exit(0)
	}

	// --- APPLY: re-verify each row inside a transaction before writing ---
	let applied = 0
	let raced = 0
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		for (const f of toFix) {
			const { rows } = await client.query(
				'SELECT birthday, vcard_data FROM contacts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
				[f.id]
			)
			if (!rows.length) {
				raced++
				continue
			}
			const curColumn = normalizeBirthday(rows[0].birthday)
			const curVcard = extractBday(rows[0].vcard_data)
			const stillColumnOff = curColumn && dayDiff(f.correct, curColumn) === 1
			const stillVcardOff = curVcard?.value && dayDiff(f.correct, curVcard.value) === 1
			if (!stillColumnOff && !stillVcardOff) {
				raced++ // changed since detection; skip to be safe
				continue
			}

			let newVcard = rewriteBday(rows[0].vcard_data, f.correct)
			if (newVcard === null) {
				// No BDAY line to patch: null vcard_data so the (fixed) sync
				// regenerates it from the corrected birthday column.
				await client.query(
					'UPDATE contacts SET birthday = $1, vcard_data = NULL, last_synced_to_radicale_at = NULL WHERE id = $2',
					[f.correct, f.id]
				)
			} else {
				await client.query(
					'UPDATE contacts SET birthday = $1, vcard_data = $2, last_synced_to_radicale_at = NULL WHERE id = $3',
					[f.correct, newVcard, f.id]
				)
			}
			applied++
		}
		await client.query('COMMIT')
	} catch (err) {
		await client.query('ROLLBACK')
		throw err
	} finally {
		client.release()
	}

	await pool.end()
	console.log(`\nApplied: ${applied} | skipped (changed since detection): ${raced}`)
	console.log('Corrected contacts have last_synced_to_radicale_at = NULL; the sync service will push the fixed vCards out automatically.\n')
	process.exit(0)
}

main().catch(err => {
	console.error('Failed:', err.message)
	process.exit(2)
})

#!/usr/bin/env node
/**
 * fix-birthday-offsets.mjs
 *
 * Repairs birthdays corrupted by the historical CSV-import timezone off-by-one
 * bug, over the HTTP API (no DB connection, no container access, no file
 * transfer to the server) so it works against a remote deployment from your
 * laptop. The original CSV stays local.
 *
 * It is intentionally conservative:
 *   - It ONLY touches a contact whose stored birthday is EXACTLY one day earlier
 *     than the original CSV value (the bug's fingerprint). Anything that differs
 *     by more than a day, already matches, or isn't in the CSV is reported and
 *     left untouched - so birthdays legitimately changed since import are never
 *     clobbered.
 *   - It DEFAULTS TO DRY-RUN. Nothing is written unless you pass --apply.
 *   - At apply time it re-fetches each contact and re-checks the fingerprint
 *     before writing, so a concurrent edit is skipped rather than overwritten.
 *
 * The fix is a full-contact round-trip: GET the contact, change only `birthday`,
 * PUT it back. The server regenerates the vCard (including the BDAY line),
 * forces a re-sync to CardDAV/devices, and records an undoable history entry.
 *
 * IMPORTANT: deploy the code fix (string-based birthday handling) first, so the
 * PUT regenerates a correct vCard and future imports don't re-introduce the shift.
 *
 * Usage (dry-run):
 *   CONTACTS_API_URL=https://contacts.example.com \
 *     node scripts/fix-birthday-offsets.mjs [path/to/original.csv]
 * Apply for real:
 *   CONTACTS_API_URL=https://contacts.example.com \
 *     node scripts/fix-birthday-offsets.mjs [path/to/original.csv] --apply
 *
 * Optional auth: CONTACTS_API_AUTH="Bearer <token>"
 * Default CSV path: private/contacts_import.csv
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API = (process.env.CONTACTS_API_URL || '').replace(/\/+$/, '')
const APPLY = process.argv.includes('--apply')
const csvArg = process.argv.slice(2).find(a => !a.startsWith('--'))
const CSV_PATH = csvArg ? resolve(csvArg) : join(REPO_ROOT, 'private/contacts_import.csv')

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

function dayDiff(a, b) {
	const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
	const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
	return Math.round((da - db) / 86400000)
}

function bdayFromVcard(vcard) {
	if (!vcard) return null
	const m = vcard.match(/^BDAY[^:\r\n]*:([^\r\n]*)/im)
	return m ? normalizeBirthday(m[1]) : null
}

const norm = s => (s || '').toString().trim().toLowerCase()

function authHeaders(extra) {
	const h = { Accept: 'application/json', ...extra }
	if (process.env.CONTACTS_API_AUTH) h.Authorization = process.env.CONTACTS_API_AUTH
	return h
}

async function getJson(path) {
	const res = await fetch(`${API}${path}`, { headers: authHeaders() })
	if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${res.statusText}`)
	return res.json()
}

// off-by-one fingerprint: stored column OR vCard BDAY is exactly csv - 1 day.
function isOffByOne(contact, csvBday) {
	const stored = normalizeBirthday(contact.birthday)
	const vcardBday = bdayFromVcard(contact.vcard_data)
	const c = stored && dayDiff(csvBday, stored) === 1
	const v = vcardBday && dayDiff(csvBday, vcardBday) === 1
	return { hit: !!(c || v), stored, vcardBday }
}

async function main() {
	if (!API) {
		console.error('ERROR: CONTACTS_API_URL is not set.')
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
		originals.push({ fullName: `${first} ${last}`.trim(), nameKey: norm(`${first} ${last}`), emailKey: norm(r[iEmail]), bday })
	}

	const list = await getJson('/api/contacts')
	const contacts = Array.isArray(list) ? list : list.contacts || list.data || []

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

	const toFix = []
	const skipped = []
	for (const o of originals) {
		const c = (o.nameKey && byName.get(o.nameKey)) || (o.emailKey && byEmail.get(o.emailKey)) || null
		if (!c) {
			skipped.push({ name: o.fullName, reason: 'not matched to a contact', csv: o.bday })
			continue
		}
		const { hit, stored, vcardBday } = isOffByOne(c, o.bday)
		if (!hit) {
			const differs = (stored && stored !== o.bday) || (vcardBday && vcardBday !== o.bday)
			if (differs) skipped.push({ name: o.fullName, reason: 'differs but not by one day - left untouched', csv: o.bday, stored, vcardBday })
			continue
		}
		toFix.push({ id: c.id, name: o.fullName, correct: o.bday, stored, vcardBday })
	}

	console.log(`\nBirthday off-by-one REPAIR ${APPLY ? '(APPLY)' : '(DRY-RUN - no writes)'}`)
	console.log(`API: ${API} | source: ${CSV_PATH}`)
	console.log(`contacts: ${contacts.length} | CSV birthdays: ${originals.length} | to fix: ${toFix.length}\n`)
	for (const f of toFix) console.log(`  FIX ${f.name} [${f.id}]: stored ${f.stored ?? '-'} / vcard ${f.vcardBday ?? '-'}  ->  ${f.correct}`)
	if (skipped.length) {
		console.log(`\nLeft untouched (${skipped.length}):`)
		for (const s of skipped) {
			const extra = s.stored !== undefined ? ` (csv=${s.csv}, stored=${s.stored ?? '-'}, vcard=${s.vcardBday ?? '-'})` : ` (csv=${s.csv})`
			console.log(`  - ${s.name}: ${s.reason}${extra}`)
		}
	}

	if (!APPLY) {
		console.log(`\nDry-run only. Re-run with --apply to write the ${toFix.length} fix(es).\n`)
		process.exit(0)
	}

	let applied = 0
	let skippedRace = 0
	let failed = 0
	for (const f of toFix) {
		try {
			// Re-fetch the full contact and re-verify the fingerprint before writing.
			const current = await getJson(`/api/contacts/${encodeURIComponent(f.id)}`)
			const { hit } = isOffByOne(current, f.correct)
			if (!hit) {
				skippedRace++
				continue
			}
			// Full round-trip: change ONLY birthday, PUT everything else back as-is.
			const body = { ...current, birthday: f.correct }
			const res = await fetch(`${API}/api/contacts/${encodeURIComponent(f.id)}`, {
				method: 'PUT',
				headers: authHeaders({ 'Content-Type': 'application/json' }),
				body: JSON.stringify(body),
			})
			if (!res.ok) {
				failed++
				console.error(`  ! ${f.name} [${f.id}]: PUT -> ${res.status} ${res.statusText}`)
				continue
			}
			applied++
		} catch (err) {
			failed++
			console.error(`  ! ${f.name} [${f.id}]: ${err.message}`)
		}
	}

	console.log(`\nApplied: ${applied} | skipped (changed since detection): ${skippedRace} | failed: ${failed}`)
	console.log('The server regenerated each vCard and forced a re-sync to CardDAV; changes are undoable in the app history.\n')
	process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
	console.error('Failed:', err.message)
	process.exit(2)
})

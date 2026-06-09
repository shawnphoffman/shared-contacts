#!/usr/bin/env node
/**
 * check-birthday-offsets.mjs  (READ-ONLY)
 *
 * Detects birthdays corrupted by the historical CSV-import timezone off-by-one
 * bug: a date-only value (e.g. 1978-09-03) parsed via `new Date()` became
 * midnight UTC, then was read back with local-timezone getters, shifting it a
 * day earlier in timezones behind UTC.
 *
 * It runs entirely against the HTTP API (no DB connection, no container access,
 * no file transfer to the server), so it works against a remote deployment from
 * your laptop. The original CSV stays local. It only issues GET requests.
 *
 * Note: the bug shifted BOTH the `birthday` column and the BDAY line in the
 * vCard together, so they agree with each other - the original CSV is the only
 * ground truth.
 *
 * Usage:
 *   CONTACTS_API_URL=https://contacts.example.com \
 *     node scripts/check-birthday-offsets.mjs [path/to/original.csv]
 *
 * Optional auth (if the app sits behind an authenticating proxy):
 *   CONTACTS_API_AUTH="Bearer <token>"   # sent as the Authorization header
 *
 * Default CSV path: private/contacts_import.csv
 * Exit code: 1 if any off-by-one found, else 0.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API = (process.env.CONTACTS_API_URL || '').replace(/\/+$/, '')
const csvArg = process.argv.slice(2).find(a => !a.startsWith('--'))
const CSV_PATH = csvArg ? resolve(csvArg) : join(REPO_ROOT, 'private/contacts_import.csv')

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

function bdayFromVcard(vcard) {
	if (!vcard) return null
	const m = vcard.match(/^BDAY[^:\r\n]*:([^\r\n]*)/im)
	return m ? normalizeBirthday(m[1]) : null
}

const norm = s => (s || '').toString().trim().toLowerCase()

async function fetchContacts() {
	const headers = { Accept: 'application/json' }
	if (process.env.CONTACTS_API_AUTH) headers.Authorization = process.env.CONTACTS_API_AUTH
	const res = await fetch(`${API}/api/contacts`, { headers })
	if (!res.ok) throw new Error(`GET /api/contacts -> ${res.status} ${res.statusText}`)
	const data = await res.json()
	// Endpoint returns a flat array by default; tolerate a paginated envelope too.
	return Array.isArray(data) ? data : data.contacts || data.data || []
}

async function main() {
	if (!API) {
		console.error('ERROR: CONTACTS_API_URL is not set. Example:')
		console.error('  CONTACTS_API_URL=https://contacts.example.com node scripts/check-birthday-offsets.mjs')
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

	const contacts = await fetchContacts()

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
		const diffs = [stored, vcardBday].filter(Boolean).map(s => dayDiff(o.bday, s))
		if (diffs.some(d => d === 1)) buckets.offByOne.push(entry)
		else if (diffs.some(d => d !== 0)) buckets.otherMismatch.push(entry)
		else buckets.ok.push(entry)
	}

	const pr = (e, label) =>
		console.log(`  - ${e.name} [${e.id}]: ${label} (csv=${e.original}, stored=${e.stored ?? '-'}, vcard=${e.vcardBday ?? '-'})`)

	console.log(`\nBirthday off-by-one report  (API: ${API}, source: ${CSV_PATH})`)
	console.log(`Originals with a birthday: ${originals.length} | contacts fetched: ${contacts.length}\n`)
	console.log(`OFF BY ONE (likely corrupted): ${buckets.offByOne.length}`)
	buckets.offByOne.forEach(e => pr(e, 'shifted -1 day'))
	console.log(`\nOTHER MISMATCH (differs, not by one day - changed since import?): ${buckets.otherMismatch.length}`)
	buckets.otherMismatch.forEach(e => pr(e, 'mismatch'))
	console.log(`\nNO STORED BIRTHDAY (in CSV but missing on server): ${buckets.noStored.length}`)
	buckets.noStored.forEach(e => pr(e, 'missing'))
	console.log(`\nNOT MATCHED to a contact: ${buckets.notFound.length}`)
	buckets.notFound.forEach(o => console.log(`  - ${o.fullName} (csv=${o.bday})`))
	console.log(`\nOK (matches): ${buckets.ok.length}`)
	console.log('\nNothing was modified. This script is read-only.\n')

	process.exit(buckets.offByOne.length > 0 ? 1 : 0)
}

main().catch(err => {
	console.error('Failed:', err.message)
	process.exit(2)
})

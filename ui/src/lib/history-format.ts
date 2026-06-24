export interface HistoryRow {
	id: string
	contact_id: string | null
	operation: string
	source: string
	actor: string | null
	actor_type: string | null
	user_agent: string | null
	summary: string | null
	changed_fields: Array<string> | null
	previous_state: Record<string, unknown> | null
	new_state: Record<string, unknown> | null
	related_contact_ids: Array<string> | null
	undone_at: string | null
	undoes_history_id: string | null
	created_at: string
}

export interface FieldChange {
	field: string
	before: string
	after: string
	hasValues: boolean
}

export interface HistoryResponse {
	rows: Array<HistoryRow>
	total: number
}

// Friendly labels for the noisier snake_case column names. Anything not listed
// falls back to a generic prettifier, so new fields still render acceptably.
const FIELD_LABELS: Record<string, string> = {
	full_name: 'Name',
	first_name: 'First name',
	last_name: 'Last name',
	middle_name: 'Middle name',
	maiden_name: 'Maiden name',
	name_prefix: 'Name prefix',
	name_suffix: 'Name suffix',
	job_title: 'Job title',
	org_units: 'Org units',
	prod_id: 'Product ID',
	time_zone: 'Time zone',
	sort_string: 'Sort string',
	vcard_data: 'vCard data',
}

export function humanizeField(field: string): string {
	return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

// Derived/serialized fields that aren't useful to diff line-by-line. vcard_data
// is the regenerated vCard text (the sync service stores it in snapshots); it
// changes on every edit and just restates the structured field changes, so we
// hide it from the per-field diff rather than dumping the whole document twice.
const DIFF_HIDE_FIELDS = new Set(['vcard_data'])

const MAX_VALUE_LENGTH = 160

// Pull a short, human-readable label out of an object snapshot value rather
// than dumping raw JSON. Handles the {value, type} shape used by
// phones/emails/addresses/urls, and named records like address books
// ({name, slug, ...}); falls back to compact JSON only when nothing readable
// is present.
const OBJECT_LABEL_KEYS = ['name', 'label', 'title', 'slug', 'email', 'number', 'address']

function objectLabel(item: Record<string, unknown>): string {
	if ('value' in item && (typeof item.value === 'string' || typeof item.value === 'number')) {
		const type = typeof item.type === 'string' ? item.type : undefined
		return type ? `${item.value} (${type})` : String(item.value)
	}
	for (const key of OBJECT_LABEL_KEYS) {
		const candidate = item[key]
		if (typeof candidate === 'string' && candidate.trim() !== '') return candidate
	}
	return JSON.stringify(item)
}

// Render a stored snapshot value as a short, human-readable string. Handles the
// {value, type} shape, named records (address books), plain arrays, and
// scalars, collapses empty values to a dash, and truncates very long values.
export function formatValue(value: unknown): string {
	if (value === null || value === undefined || value === '') return '—'
	let text: string
	if (Array.isArray(value)) {
		text = value.map(item => (item && typeof item === 'object' ? objectLabel(item as Record<string, unknown>) : String(item))).join(', ')
	} else if (typeof value === 'object') {
		text = objectLabel(value as Record<string, unknown>)
	} else {
		text = String(value)
	}
	if (!text) return '—'
	return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text
}

export function computeChanges(row: HistoryRow): Array<FieldChange> {
	const fields = (row.changed_fields ?? []).filter(field => !DIFF_HIDE_FIELDS.has(field))
	const prev = row.previous_state ?? {}
	const next = row.new_state ?? {}
	return (
		fields
			.map(field => {
				const hasValues = field in prev || field in next
				return {
					field,
					before: formatValue(prev[field]),
					after: formatValue(next[field]),
					hasValues,
				}
			})
			// Drop no-op rows where the recorded before/after render identically
			// (e.g. empty-string vs null both formatting to "—"). Rows without
			// recorded values are kept since the change can't be confirmed no-op.
			.filter(change => !(change.hasValues && change.before === change.after))
	)
}

export function formatHistoryDate(dateStr: string): string {
	return new Date(dateStr).toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

export function describeSource(source: string): string {
	switch (source) {
		case 'web':
			return 'Web'
		case 'api':
			return 'API'
		case 'carddav':
			return 'CardDAV client'
		case 'sync':
			return 'Sync service'
		case 'import':
			return 'CSV import'
		case 'merge':
			return 'Manual merge'
		case 'dedup':
			return 'Auto-dedup'
		case 'system':
			return 'System'
		default:
			return source
	}
}

export function operationBadgeClass(op: string): string {
	const base = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'
	switch (op) {
		case 'create':
			return `${base} bg-green-500/15 text-green-700 dark:text-green-400`
		case 'update':
			return `${base} bg-blue-500/15 text-blue-700 dark:text-blue-400`
		case 'delete':
			return `${base} bg-orange-500/15 text-orange-700 dark:text-orange-400`
		case 'permanent_delete':
			return `${base} bg-red-500/15 text-red-700 dark:text-red-400`
		case 'restore':
			return `${base} bg-teal-500/15 text-teal-700 dark:text-teal-400`
		case 'merge':
			return `${base} bg-purple-500/15 text-purple-700 dark:text-purple-400`
		case 'undo':
			return `${base} bg-yellow-500/15 text-yellow-700 dark:text-yellow-400`
		default:
			return `${base} bg-muted text-muted-foreground`
	}
}

export const UNDOABLE_OPS = new Set(['create', 'update', 'delete', 'restore', 'merge', 'permanent_delete'])

export async function fetchHistory(contactId?: string): Promise<HistoryResponse> {
	const params = new URLSearchParams()
	if (contactId) params.set('contactId', contactId)
	const response = await fetch(`/api/history?${params.toString()}`)
	if (!response.ok) throw new Error('Failed to fetch history')
	return response.json()
}

export async function undoHistory(historyId: string): Promise<{ message: string }> {
	const response = await fetch(`/api/history/${historyId}/undo`, { method: 'POST' })
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Undo failed')
	}
	return response.json()
}

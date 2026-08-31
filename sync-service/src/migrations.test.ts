import { describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('./db', () => ({ getPool: vi.fn() }))
vi.mock('./logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { findUnlistedMigrations } from './migrations'

describe('findUnlistedMigrations', () => {
	it('finds nothing for this repository', () => {
		// The guard that matters: adding a file under migrations/ without adding
		// it to the list in migrations.ts means it silently never runs.
		expect(findUnlistedMigrations()).toEqual([])
	})

	it('reports a migration the list does not mention', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-drift-'))
		try {
			fs.writeFileSync(path.join(dir, '01_init_schema.sql'), '-- listed')
			fs.writeFileSync(path.join(dir, '23_something_new.sql'), '-- forgotten')
			fs.writeFileSync(path.join(dir, 'notes.md'), 'not a migration')

			expect(findUnlistedMigrations(dir)).toEqual(['23_something_new.sql'])
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})
})

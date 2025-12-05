import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set')
    }

    // Determine SSL configuration
    // Disable SSL by default for Docker internal connections
    // Only enable if explicitly requested via DATABASE_SSL env var
    // or if the connection string contains sslmode parameter
    const urlHasSSL = databaseUrl.includes('sslmode=')
    const useSSL = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_SSL === '1' || urlHasSSL
    const sslConfig = useSSL
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false

    pool = new Pool({
      connectionString: databaseUrl,
      ssl: sslConfig,
      connectionTimeoutMillis: 2000,
    })
  }
  return pool
}

export interface Contact {
  id: string
  vcard_id: string | null
  full_name: string | null
  first_name: string | null
  last_name: string | null
  nickname: string | null
  email: string | null
  phone: string | null
  organization: string | null
  job_title: string | null
  address: string | null
  notes: string | null
  vcard_data: string | null
  created_at: Date
  updated_at: Date
}

export async function getAllContacts(): Promise<Contact[]> {
  const pool = getPool()
  const result = await pool.query('SELECT * FROM contacts ORDER BY full_name, created_at DESC')
  return result.rows
}

export async function getContactById(id: string): Promise<Contact | null> {
  const pool = getPool()
  const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [id])
  return result.rows[0] || null
}

export async function getContactByVcardId(vcardId: string): Promise<Contact | null> {
  const pool = getPool()
  const result = await pool.query('SELECT * FROM contacts WHERE vcard_id = $1', [vcardId])
  return result.rows[0] || null
}

export async function createContact(contact: Partial<Contact>): Promise<Contact> {
  const pool = getPool()
  const result = await pool.query(
    `INSERT INTO contacts (vcard_id, full_name, first_name, last_name, nickname, email, phone, organization, job_title, address, notes, vcard_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      contact.vcard_id || null,
      contact.full_name || null,
      contact.first_name || null,
      contact.last_name || null,
      contact.nickname || null,
      contact.email || null,
      contact.phone || null,
      contact.organization || null,
      contact.job_title || null,
      contact.address || null,
      contact.notes || null,
      contact.vcard_data || null,
    ]
  )
  return result.rows[0]
}

export async function updateContact(id: string, contact: Partial<Contact>): Promise<Contact> {
  const pool = getPool()
  const updates: string[] = []
  const values: any[] = []
  let paramIndex = 1

  const fields: (keyof Contact)[] = [
    'vcard_id',
    'full_name',
    'first_name',
    'last_name',
    'nickname',
    'email',
    'phone',
    'organization',
    'job_title',
    'address',
    'notes',
    'vcard_data',
  ]

  for (const field of fields) {
    if (contact[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`)
      values.push(contact[field])
      paramIndex++
    }
  }

  if (updates.length === 0) {
    throw new Error('No fields to update')
  }

  values.push(id)
  const result = await pool.query(
    `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  )
  return result.rows[0]
}

export async function deleteContact(id: string): Promise<void> {
  const pool = getPool()
  await pool.query('DELETE FROM contacts WHERE id = $1', [id])
}


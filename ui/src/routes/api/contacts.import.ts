import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createContact, type Contact } from '../../lib/db'
import { generateVCard, extractUID } from '../../lib/vcard'

/**
 * Simple CSV parser that handles quoted fields
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  // Add last field
  values.push(current.trim())

  return values
}

function parseCSV(csvText: string): Array<Record<string, string>> {
  const lines = csvText.split('\n').filter((line) => line.trim())
  if (lines.length === 0) return []

  // Parse header
  const headers = parseCSVLine(lines[0]!).map((h) => h.trim())
  const rows: Array<Record<string, string>> = []

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}

    for (let j = 0; j < headers.length; j++) {
      const value = values[j] || ''
      // Remove surrounding quotes if present
      const cleanValue =
        value.startsWith('"') && value.endsWith('"')
          ? value.slice(1, -1)
          : value
      row[headers[j]!] = cleanValue.trim()
    }

    rows.push(row)
  }

  return rows
}

/**
 * Map CSV row to Contact format
 */
function mapCSVRowToContact(row: Record<string, string>): Partial<Contact> {
  const first = row.first || ''
  const last = row.last || ''
  const fullName = `${first} ${last}`.trim() || 'Unnamed Contact'

  // Prefer phone, fallback to phone_home
  const phone = row.phone || row.phone_home || null

  // Prefer email, then email_work, then email_other
  const email = row.email || row.email_work || row.email_other || null

  // Parse birthday (format: YYYY-MM-DD)
  let birthday: Date | null = null
  if (row.bday) {
    const bdayDate = new Date(row.bday)
    if (!isNaN(bdayDate.getTime())) {
      birthday = bdayDate
    }
  }

  return {
    first_name: first || null,
    last_name: last || null,
    middle_name: row.middle || null,
    full_name: fullName,
    nickname: row.nick || null,
    maiden_name: row.maiden || null,
    email: email,
    phone: phone,
    organization: row.company || null,
    job_title: row.job_title || null,
    birthday: birthday,
    homepage: row.homepage || null,
    // Note: address, notes not in CSV, but could be added later
    address: null,
    notes: null,
  }
}

export const Route = createFileRoute('/api/contacts/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const formData = await request.formData()
          const file = formData.get('file') as File | null

          if (!file) {
            return json({ error: 'No file provided' }, { status: 400 })
          }

          if (!file.name.endsWith('.csv')) {
            return json({ error: 'File must be a CSV' }, { status: 400 })
          }

          // Read file content
          const csvText = await file.text()
          const rows = parseCSV(csvText)

          if (rows.length === 0) {
            return json({ error: 'CSV file is empty' }, { status: 400 })
          }

          const results = {
            success: 0,
            failed: 0,
            errors: [] as Array<{ row: number; error: string }>,
          }

          // Process each row
          for (let i = 0; i < rows.length; i++) {
            try {
              const contactData = mapCSVRowToContact(rows[i]!)

              // Skip if no meaningful data
              if (
                !contactData.full_name &&
                !contactData.email &&
                !contactData.phone
              ) {
                continue
              }

              // Generate vCard data
              const vcardData = generateVCard(contactData)
              const vcardId = extractUID(vcardData) || undefined

              await createContact({
                ...contactData,
                vcard_id: vcardId,
                vcard_data: vcardData,
              })

              results.success++
            } catch (error) {
              results.failed++
              results.errors.push({
                row: i + 2, // +2 because row 1 is header, and we're 0-indexed
                error: error instanceof Error ? error.message : 'Unknown error',
              })
            }
          }

          return json({
            message: `Imported ${results.success} contacts${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
            ...results,
          })
        } catch (error) {
          console.error('Error importing CSV:', error)
          return json(
            {
              error: 'Failed to import CSV',
              details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})

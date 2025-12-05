/**
 * CSV Parser with flexible column mapping
 * Handles various CSV formats and missing/optional data
 */

export interface ParsedContact {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  organization: string | null;
  job_title: string | null;
  address: string | null;
  notes: string | null;
  rowNumber: number; // Original row number in CSV (1-indexed, excluding header)
  rawData: Record<string, string>; // Original CSV row data
}

export interface ParseResult {
  contacts: ParsedContact[];
  errors: ParseError[];
  warnings: string[];
}

export interface ParseError {
  row: number;
  message: string;
  field?: string;
}

/**
 * Column name mappings - flexible matching
 */
const COLUMN_MAPPINGS: Record<string, string[]> = {
  full_name: ['full name', 'fullname', 'name', 'display name', 'displayname'],
  first_name: ['first name', 'firstname', 'first', 'given name', 'givenname'],
  last_name: ['last name', 'lastname', 'last', 'family name', 'familyname', 'surname'],
  email: ['email', 'e-mail', 'email address', 'emailaddress', 'mail'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'phone number', 'phonenumber'],
  organization: ['organization', 'org', 'company', 'employer', 'workplace'],
  job_title: ['job title', 'jobtitle', 'title', 'position', 'role', 'job'],
  address: ['address', 'street', 'street address', 'streetaddress', 'location'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'description'],
};

/**
 * Normalize column name for matching
 */
function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase().replace(/[_\s-]+/g, ' ');
}

/**
 * Find matching field for a column name
 */
function findMatchingField(columnName: string): string | null {
  const normalized = normalizeColumnName(columnName);

  for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    for (const alias of aliases) {
      if (normalized === alias || normalized.includes(alias) || alias.includes(normalized)) {
        return field;
      }
    }
  }

  return null;
}

/**
 * Parse CSV string into contacts
 */
export function parseCSV(csvContent: string): ParseResult {
  const contacts: ParsedContact[] = [];
  const errors: ParseError[] = [];
  const warnings: string[] = [];

  if (!csvContent || csvContent.trim().length === 0) {
    errors.push({ row: 0, message: 'CSV file is empty' });
    return { contacts, errors, warnings };
  }

  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length < 2) {
    errors.push({ row: 0, message: 'CSV must have at least a header row and one data row' });
    return { contacts, errors, warnings };
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  if (headers.length === 0) {
    errors.push({ row: 1, message: 'Could not parse header row' });
    return { contacts, errors, warnings };
  }

  // Build column mapping
  const columnMap: Record<string, number> = {};
  const unmappedColumns: string[] = [];

  headers.forEach((header, index) => {
    const field = findMatchingField(header);
    if (field) {
      columnMap[field] = index;
    } else {
      unmappedColumns.push(header);
    }
  });

  if (unmappedColumns.length > 0) {
    warnings.push(`Unmapped columns found: ${unmappedColumns.join(', ')}. These will be ignored.`);
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const rowNumber = i + 1; // 1-indexed, accounting for header

    try {
      const values = parseCSVLine(line);

      // Build raw data object
      const rawData: Record<string, string> = {};
      headers.forEach((header, index) => {
        rawData[header] = values[index] || '';
      });

      // Extract contact data
      const contact: ParsedContact = {
        full_name: getValue(values, columnMap, 'full_name'),
        first_name: getValue(values, columnMap, 'first_name'),
        last_name: getValue(values, columnMap, 'last_name'),
        email: getValue(values, columnMap, 'email'),
        phone: getValue(values, columnMap, 'phone'),
        organization: getValue(values, columnMap, 'organization'),
        job_title: getValue(values, columnMap, 'job_title'),
        address: getValue(values, columnMap, 'address'),
        notes: getValue(values, columnMap, 'notes'),
        rowNumber,
        rawData,
      };

      // If full_name is empty but we have first_name and/or last_name, construct it
      if (!contact.full_name && (contact.first_name || contact.last_name)) {
        contact.full_name = [contact.first_name, contact.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() || null;
      }

      // If we have full_name but no first/last, try to split it
      if (contact.full_name && !contact.first_name && !contact.last_name) {
        const nameParts = contact.full_name.trim().split(/\s+/);
        if (nameParts.length >= 2) {
          contact.last_name = nameParts.pop() || null;
          contact.first_name = nameParts.join(' ') || null;
        } else if (nameParts.length === 1) {
          contact.first_name = nameParts[0] || null;
        }
      }

      // Only add contact if it has at least some identifying information
      if (contact.full_name || contact.email || contact.phone) {
        contacts.push(contact);
      } else {
        warnings.push(`Row ${rowNumber}: Skipped - no identifying information (name, email, or phone)`);
      }
    } catch (error) {
      errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Failed to parse row',
      });
    }
  }

  return { contacts, errors, warnings };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = i + 1 < line.length ? line[i + 1] : null;

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i += 2;
        continue;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
        continue;
      }
    }

    if (char === ',' && !inQuotes) {
      // End of field
      values.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += char;
    i++;
  }

  // Add last field
  values.push(current.trim());

  return values;
}

/**
 * Get value from CSV row using column mapping
 */
function getValue(
  values: string[],
  columnMap: Record<string, number>,
  field: string
): string | null {
  const index = columnMap[field];
  if (index === undefined || index >= values.length) {
    return null;
  }

  const value = values[index]?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Parse CSV file from File object
 */
export async function parseCSVFile(file: File): Promise<ParseResult> {
  const text = await file.text();
  return parseCSV(text);
}


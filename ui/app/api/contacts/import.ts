import { createAPIFileRoute } from '@tanstack/start/api';
import { parseCSVFile, ParsedContact } from '~/lib/csv-parser';
import { validateContacts, ValidationResult } from '~/lib/csv-validator';
import { detectDuplicates, DuplicateMatch } from '~/lib/duplicate-detector';

export interface ImportPreview {
  contacts: ParsedContact[];
  duplicates: DuplicateMatch[];
  validation: ValidationResult;
  totalRows: number;
}

/**
 * Preview import - parse CSV and detect duplicates
 */
export const Route = createAPIFileRoute('/api/contacts/import')({
  POST: async ({ request }) => {
    try {
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return Response.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      // Check file type
      if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        return Response.json(
          { error: 'File must be a CSV file' },
          { status: 400 }
        );
      }

      // Parse CSV
      const parseResult = await parseCSVFile(file);

      if (parseResult.errors.length > 0 && parseResult.contacts.length === 0) {
        return Response.json(
          { error: 'Failed to parse CSV', details: parseResult.errors },
          { status: 400 }
        );
      }

      // Validate contacts
      const validation = validateContacts(parseResult.contacts);

      // Detect duplicates
      const duplicateResult = await detectDuplicates(parseResult.contacts);

      const preview: ImportPreview = {
        contacts: parseResult.contacts,
        duplicates: duplicateResult.duplicates,
        validation,
        totalRows: parseResult.contacts.length,
      };

      return Response.json(preview);
    } catch (error) {
      console.error('Import preview error:', error);
      return Response.json(
        { error: 'Failed to process CSV file', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  },
});



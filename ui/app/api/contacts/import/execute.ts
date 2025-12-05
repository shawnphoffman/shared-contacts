import { createAPIFileRoute } from '@tanstack/start/api';
import { ParsedContact } from '~/lib/csv-parser';
import { createContact, updateContact, getPool } from '~/lib/db';
import { generateVCard, extractUID } from '~/lib/vcard';

export interface ImportAction {
  action: 'skip' | 'update' | 'create';
  parsedContact: ParsedContact;
  existingContactId?: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  warnings: string[];
}

export const Route = createAPIFileRoute('/api/contacts/import/execute')({
  POST: async ({ request }) => {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const body = await request.json();
      const { contacts, actions }: { contacts: ParsedContact[]; actions: ImportAction[] } = body;

      const result: ImportResult = {
        success: true,
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        warnings: [],
      };

      // Create action map for quick lookup
      const actionMap = new Map<string, ImportAction>();
      for (const action of actions) {
        const key = `${action.parsedContact.rowNumber}`;
        actionMap.set(key, action);
      }

      // Process each contact
      for (const contact of contacts) {
        const key = `${contact.rowNumber}`;
        const action = actionMap.get(key);

        if (!action || action.action === 'skip') {
          result.skipped++;
          continue;
        }

        try {
          // Generate vCard data
          const vcardData = generateVCard({}, contact);
          const vcardId = extractUID(vcardData);

          const contactData = {
            vcard_id: vcardId,
            full_name: contact.full_name,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            phone: contact.phone,
            organization: contact.organization,
            job_title: contact.job_title,
            address: contact.address,
            notes: contact.notes,
            vcard_data: vcardData,
          };

          if (action.action === 'update' && action.existingContactId) {
            // Update existing contact
            await updateContact(action.existingContactId, contactData);
            result.updated++;
          } else if (action.action === 'create') {
            // Create new contact
            await createContact(contactData);
            result.imported++;
          }
        } catch (error) {
          result.errors.push({
            row: contact.rowNumber,
            message: error instanceof Error ? error.message : 'Failed to import contact',
          });
          result.success = false;
        }
      }

      if (result.success) {
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
      }

      return Response.json(result);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Import execute error:', error);
      return Response.json(
        {
          success: false,
          error: 'Failed to execute import',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  },
});


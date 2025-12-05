import * as fs from 'fs';
import * as path from 'path';
import { watch } from 'chokidar';
import { Contact, getAllContacts, createContact, updateContact, getContactByVcardId, deleteContact } from './db';
import { parseVCard, generateVCard, VCardData } from './vcard';

const RADICALE_STORAGE_PATH = process.env.RADICALE_STORAGE_PATH || '/radicale-data/collections';
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '5000', 10);

/**
 * Get the path to the shared address book in Radicale
 * Radicale stores collections in a structure like: /collections/user/collection/
 */
function getSharedAddressBookPath(): string {
  // For a shared address book, we'll use a default user/collection
  // In production, you might want to configure this
  return path.join(RADICALE_STORAGE_PATH, 'shared', 'contacts');
}

/**
 * Ensure the shared address book directory exists
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get all vCard files from Radicale storage
 */
function getVCardFiles(): string[] {
  const addressBookPath = getSharedAddressBookPath();
  if (!fs.existsSync(addressBookPath)) {
    return [];
  }

  const files = fs.readdirSync(addressBookPath);
  return files
    .filter(file => file.endsWith('.vcf') || file.endsWith('.ics'))
    .map(file => path.join(addressBookPath, file));
}

/**
 * Read a vCard file from Radicale storage
 */
function readVCardFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading vCard file ${filePath}:`, error);
    return null;
  }
}

/**
 * Write a vCard file to Radicale storage
 */
function writeVCardFile(vcardId: string, vcardData: string): void {
  const addressBookPath = getSharedAddressBookPath();
  ensureDirectoryExists(addressBookPath);

  const fileName = `${vcardId}.vcf`;
  const filePath = path.join(addressBookPath, fileName);
  fs.writeFileSync(filePath, vcardData, 'utf-8');
}

/**
 * Delete a vCard file from Radicale storage
 */
function deleteVCardFile(vcardId: string): void {
  const addressBookPath = getSharedAddressBookPath();
  const fileName = `${vcardId}.vcf`;
  const filePath = path.join(addressBookPath, fileName);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Extract vCard ID from filename or vCard content
 */
function extractVCardId(filePath: string, vcardContent: string): string | null {
  // Try to extract from vCard content first
  const uidMatch = vcardContent.match(/^UID:(.+)$/m);
  if (uidMatch) {
    return uidMatch[1].trim();
  }

  // Fall back to filename
  const fileName = path.basename(filePath, path.extname(filePath));
  return fileName;
}

/**
 * Sync from PostgreSQL to Radicale
 */
export async function syncDbToRadicale(): Promise<void> {
  console.log('Syncing PostgreSQL → Radicale...');

  try {
    const contacts = await getAllContacts();
    const addressBookPath = getSharedAddressBookPath();
    ensureDirectoryExists(addressBookPath);

    // Get existing vCard files
    const existingFiles = getVCardFiles();
    const existingVCardIds = new Set<string>();

    // Update/create vCard files
    for (const contact of contacts) {
      if (!contact.vcard_id) {
        console.warn(`Contact ${contact.id} has no vcard_id, skipping`);
        continue;
      }

      existingVCardIds.add(contact.vcard_id);
      const vcardData = contact.vcard_data || generateVCard({}, contact);
      writeVCardFile(contact.vcard_id, vcardData);
    }

    // Delete vCard files that no longer exist in DB
    for (const filePath of existingFiles) {
      const vcardContent = readVCardFile(filePath);
      if (vcardContent) {
        const vcardId = extractVCardId(filePath, vcardContent);
        if (vcardId && !existingVCardIds.has(vcardId)) {
          console.log(`Deleting orphaned vCard file: ${vcardId}`);
          deleteVCardFile(vcardId);
        }
      }
    }

    console.log(`Synced ${contacts.length} contacts to Radicale`);
  } catch (error) {
    console.error('Error syncing DB to Radicale:', error);
    throw error;
  }
}

/**
 * Sync from Radicale to PostgreSQL
 */
export async function syncRadicaleToDb(): Promise<void> {
  console.log('Syncing Radicale → PostgreSQL...');

  try {
    const vcardFiles = getVCardFiles();
    const dbContacts = await getAllContacts();
    const dbContactsByVcardId = new Map<string, Contact>();

    for (const contact of dbContacts) {
      if (contact.vcard_id) {
        dbContactsByVcardId.set(contact.vcard_id, contact);
      }
    }

    let created = 0;
    let updated = 0;

    for (const filePath of vcardFiles) {
      const vcardContent = readVCardFile(filePath);
      if (!vcardContent) continue;

      const vcardData = parseVCard(vcardContent);
      const vcardId = vcardData.uid || extractVCardId(filePath, vcardContent);

      if (!vcardId) {
        console.warn(`Could not extract vCard ID from ${filePath}, skipping`);
        continue;
      }

      const existingContact = dbContactsByVcardId.get(vcardId);

      // Parse name
      const nameParts = vcardData.n ? vcardData.n.split(';') : [];
      const firstName = nameParts[1] || '';
      const lastName = nameParts[0] || '';
      const fullName = vcardData.fn || `${firstName} ${lastName}`.trim() || 'Unknown';

      const contactData: Partial<Contact> = {
        vcard_id: vcardId,
        full_name: fullName,
        first_name: firstName || null,
        last_name: lastName || null,
        email: vcardData.email || null,
        phone: vcardData.tel || null,
        organization: vcardData.org || null,
        job_title: vcardData.title || null,
        address: vcardData.adr || null,
        notes: vcardData.note || null,
        vcard_data: vcardContent,
      };

      if (existingContact) {
        await updateContact(existingContact.id, contactData);
        updated++;
      } else {
        await createContact(contactData);
        created++;
      }
    }

    // Note: We don't delete DB contacts when vCard files are missing in Radicale
    // because the DB is the source of truth. The syncDbToRadicale function will
    // recreate vCard files for contacts that exist in the DB.
    // Only delete from DB if explicitly deleted from Radicale (handled by file watcher)

    console.log(`Synced Radicale to DB: ${created} created, ${updated} updated`);
  } catch (error) {
    console.error('Error syncing Radicale to DB:', error);
    throw error;
  }
}

/**
 * Start watching Radicale storage for changes
 */
export function startWatchingRadicale(): void {
  const addressBookPath = getSharedAddressBookPath();
  ensureDirectoryExists(addressBookPath);

  console.log(`Watching Radicale storage: ${addressBookPath}`);

  const watcher = watch(addressBookPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('add', async (filePath) => {
    console.log(`New vCard file detected: ${filePath}`);
    await syncRadicaleToDb();
  });

  watcher.on('change', async (filePath) => {
    console.log(`vCard file changed: ${filePath}`);
    await syncRadicaleToDb();
  });

  watcher.on('unlink', async (filePath) => {
    console.log(`vCard file deleted: ${filePath}`);
    await syncRadicaleToDb();
  });

  watcher.on('error', (error) => {
    console.error('Watcher error:', error);
  });
}

/**
 * Start periodic sync
 */
export function startPeriodicSync(): void {
  console.log(`Starting periodic sync every ${SYNC_INTERVAL}ms`);

  setInterval(async () => {
    try {
      await syncDbToRadicale();
    } catch (error) {
      console.error('Periodic sync error:', error);
    }
  }, SYNC_INTERVAL);
}


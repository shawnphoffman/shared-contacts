/**
 * Simple vCard generation utility for the UI
 * Full implementation is in sync-service
 */

function generateUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export function generateVCard(data: any, contact: any): string {
  const uid = data.uid || contact.vcard_id || generateUID();
  const fullName = contact.full_name || 'Unknown';
  const firstName = contact.first_name || '';
  const lastName = contact.last_name || '';

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${uid}`,
    `FN:${fullName}`,
    `N:${lastName};${firstName};;;`,
  ];

  if (contact.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${contact.email}`);
  }
  if (contact.phone) {
    lines.push(`TEL;TYPE=CELL:${contact.phone}`);
  }
  if (contact.organization) {
    lines.push(`ORG:${contact.organization}`);
  }
  if (contact.job_title) {
    lines.push(`TITLE:${contact.job_title}`);
  }
  if (contact.address) {
    lines.push(`ADR;TYPE=HOME:;;${contact.address};;;;`);
  }
  if (contact.notes) {
    lines.push(`NOTE:${contact.notes}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/**
 * Extract UID from vCard string
 */
export function extractUID(vcardString: string): string | null {
  const uidMatch = vcardString.match(/^UID:(.+)$/m);
  return uidMatch ? uidMatch[1].trim() : null;
}


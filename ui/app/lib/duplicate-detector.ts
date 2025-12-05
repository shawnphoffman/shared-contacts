/**
 * Duplicate Detection for Contacts
 * Detects duplicates by email and name matching
 */

import { Contact, getAllContacts } from './db';
import { ParsedContact } from './csv-parser';

export interface DuplicateMatch {
  parsedContact: ParsedContact;
  existingContact: Contact;
  matchType: 'email' | 'name' | 'fuzzy_name';
  confidence: 'exact' | 'high' | 'medium';
}

export interface DuplicateDetectionResult {
  duplicates: DuplicateMatch[];
  unique: ParsedContact[];
}

/**
 * Detect duplicates in parsed contacts
 */
export async function detectDuplicates(
  parsedContacts: ParsedContact[]
): Promise<DuplicateDetectionResult> {
  // Get all existing contacts from database
  const existingContacts = await getAllContacts();

  const duplicates: DuplicateMatch[] = [];
  const unique: ParsedContact[] = [];
  const processedIndices = new Set<number>();

  // First pass: exact email matches
  for (let i = 0; i < parsedContacts.length; i++) {
    const parsed = parsedContacts[i];

    if (!parsed.email) continue;

    const normalizedEmail = parsed.email.trim().toLowerCase();
    const match = existingContacts.find(
      (existing) => existing.email?.trim().toLowerCase() === normalizedEmail
    );

    if (match) {
      duplicates.push({
        parsedContact: parsed,
        existingContact: match,
        matchType: 'email',
        confidence: 'exact',
      });
      processedIndices.add(i);
    }
  }

  // Second pass: exact name matches (for contacts without email or not matched by email)
  for (let i = 0; i < parsedContacts.length; i++) {
    if (processedIndices.has(i)) continue;

    const parsed = parsedContacts[i];
    const parsedName = normalizeName(parsed.full_name || '');

    if (!parsedName) continue;

    const match = existingContacts.find((existing) => {
      const existingName = normalizeName(existing.full_name || '');
      return existingName === parsedName && existingName.length > 0;
    });

    if (match) {
      duplicates.push({
        parsedContact: parsed,
        existingContact: match,
        matchType: 'name',
        confidence: 'exact',
      });
      processedIndices.add(i);
    }
  }

  // Third pass: fuzzy name matching (for contacts still not matched)
  for (let i = 0; i < parsedContacts.length; i++) {
    if (processedIndices.has(i)) continue;

    const parsed = parsedContacts[i];
    const parsedName = normalizeName(parsed.full_name || '');

    if (!parsedName || parsedName.length < 3) continue;

    // Find best fuzzy match
    let bestMatch: Contact | null = null;
    let bestScore = 0;
    let matchType: 'fuzzy_name' = 'fuzzy_name';

    for (const existing of existingContacts) {
      const existingName = normalizeName(existing.full_name || '');

      if (!existingName || existingName.length < 3) continue;

      const similarity = calculateSimilarity(parsedName, existingName);

      if (similarity > bestScore && similarity >= 0.8) {
        bestScore = similarity;
        bestMatch = existing;
      }
    }

    if (bestMatch) {
      const confidence: 'high' | 'medium' = bestScore >= 0.9 ? 'high' : 'medium';
      duplicates.push({
        parsedContact: parsed,
        existingContact: bestMatch,
        matchType,
        confidence,
      });
      processedIndices.add(i);
    }
  }

  // Collect unique contacts
  for (let i = 0; i < parsedContacts.length; i++) {
    if (!processedIndices.has(i)) {
      unique.push(parsedContacts[i]);
    }
  }

  return { duplicates, unique };
}

/**
 * Normalize name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

/**
 * Calculate similarity between two strings (simple Levenshtein-based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  // Check if one contains the other
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  // Simple word-based similarity
  const words1 = str1.split(/\s+/).filter(Boolean);
  const words2 = str2.split(/\s+/).filter(Boolean);

  if (words1.length === 0 || words2.length === 0) return 0;

  const commonWords = words1.filter((word) => words2.includes(word));
  const totalWords = Math.max(words1.length, words2.length);

  return commonWords.length / totalWords;
}

/**
 * Get duplicate action choice key
 */
export function getDuplicateActionKey(
  parsedContact: ParsedContact,
  existingContact: Contact
): string {
  return `${parsedContact.rowNumber}-${existingContact.id}`;
}


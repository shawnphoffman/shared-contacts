/**
 * CSV Validator with lenient validation
 * Generates warnings but allows import to proceed
 */

import { ParsedContact } from './csv-parser';

export interface ValidationResult {
  isValid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
}

export interface ValidationWarning {
  row: number;
  field: string;
  message: string;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

/**
 * Email validation regex (lenient)
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a single contact
 */
export function validateContact(contact: ParsedContact): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationError[] = [];

  // Email validation (warning if invalid format, but allow empty)
  if (contact.email) {
    const normalizedEmail = contact.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      warnings.push({
        row: contact.rowNumber,
        field: 'email',
        message: `Invalid email format: "${contact.email}"`,
      });
    }
  }

  // Phone number normalization and validation
  if (contact.phone) {
    const normalized = normalizePhone(contact.phone);
    if (normalized.length < 10) {
      warnings.push({
        row: contact.rowNumber,
        field: 'phone',
        message: `Phone number appears incomplete: "${contact.phone}"`,
      });
    }
  }

  // Name validation (warn if completely missing)
  if (!contact.full_name && !contact.first_name && !contact.last_name) {
    if (!contact.email && !contact.phone) {
      warnings.push({
        row: contact.rowNumber,
        field: 'name',
        message: 'No name provided and no email/phone for identification',
      });
    }
  }

  // Organization validation (optional, but warn if suspicious)
  if (contact.organization && contact.organization.length < 2) {
    warnings.push({
      row: contact.rowNumber,
      field: 'organization',
      message: 'Organization name seems too short',
    });
  }

  // Address validation (optional, but check for suspicious patterns)
  if (contact.address && contact.address.length > 500) {
    warnings.push({
      row: contact.rowNumber,
      field: 'address',
      message: 'Address seems unusually long',
    });
  }

  // Notes validation (optional, but check length)
  if (contact.notes && contact.notes.length > 2000) {
    warnings.push({
      row: contact.rowNumber,
      field: 'notes',
      message: 'Notes are very long (over 2000 characters)',
    });
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate multiple contacts
 */
export function validateContacts(contacts: ParsedContact[]): ValidationResult {
  const allWarnings: ValidationWarning[] = [];
  const allErrors: ValidationError[] = [];

  for (const contact of contacts) {
    const result = validateContact(contact);
    allWarnings.push(...result.warnings);
    allErrors.push(...result.errors);
  }

  return {
    isValid: allErrors.length === 0,
    warnings: allWarnings,
    errors: allErrors,
  };
}

/**
 * Normalize phone number (remove common formatting)
 */
export function normalizePhone(phone: string): string {
  // Remove common phone number formatting
  return phone
    .replace(/[\s\-\(\)\.]/g, '') // Remove spaces, dashes, parentheses, dots
    .replace(/^\+1/, '') // Remove US country code
    .replace(/^1/, '') // Remove leading 1
    .trim();
}

/**
 * Format phone number for display (US format)
 */
export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);

  if (normalized.length === 10) {
    // Format as (XXX) XXX-XXXX
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }

  // Return original if can't format
  return phone;
}


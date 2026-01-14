/**
 * Validation utilities for contact form fields
 */

/**
 * Validates an email address
 * @param email - Email address to validate
 * @returns Error message if invalid, null if valid
 */
export function validateEmail(email: string): string | null {
  if (!email || email.trim() === '') {
    return 'Email is required'
  }

  // RFC 5322 compliant email regex (simplified but practical)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(email.trim())) {
    return 'Please enter a valid email address'
  }

  return null
}

/**
 * Validates a URL
 * @param url - URL to validate
 * @returns Error message if invalid, null if valid
 */
export function validateUrl(url: string): string | null {
  if (!url || url.trim() === '') {
    return 'URL is required'
  }

  const trimmedUrl = url.trim()

  // Try to parse as URL - if it fails, it's invalid
  try {
    // If URL doesn't have a protocol, try adding https://
    const urlToTest = trimmedUrl.includes('://')
      ? trimmedUrl
      : `https://${trimmedUrl}`

    const urlObj = new URL(urlToTest)

    // Check for valid protocol
    if (!['http:', 'https:', 'ftp:', 'mailto:'].includes(urlObj.protocol)) {
      return 'URL must use http, https, ftp, or mailto protocol'
    }

    // Check for valid hostname
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      return 'Please enter a valid URL'
    }

    return null
  } catch {
    return 'Please enter a valid URL'
  }
}

/**
 * Normalizes a URL by adding protocol if missing
 * @param url - URL to normalize
 * @returns Normalized URL with protocol
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  // If it already has a protocol, return as-is
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    return trimmed
  }

  // Add https:// by default
  return `https://${trimmed}`
}

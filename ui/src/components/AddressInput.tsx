import { useState, useEffect } from 'react'
import { Input } from './ui/input'

/**
 * Structured address data
 */
export interface StructuredAddress {
  street: string
  extended: string // Address line 2 (apartment, suite, etc.)
  city: string
  state: string
  postal: string
  country: string
}

/**
 * Parse vCard address format: ;;street;extended;city;state;postal;country
 * Also handles plain text addresses and tries to extract structured components
 */
export function parseAddress(addressValue: string): StructuredAddress {
  // Check if it's in vCard format (starts with ;;)
  if (addressValue.startsWith(';;')) {
    const parts = addressValue.split(';')
    return {
      street: parts[2] || '',
      extended: parts[3] || '', // Extended address (line 2)
      city: parts[4] || '',
      state: parts[5] || '',
      postal: parts[6] || '',
      country: parts[7] || '',
    }
  }

  // If it's plain text, try to parse common formats
  if (!addressValue.trim()) {
    return {
      street: '',
      extended: '',
      city: '',
      state: '',
      postal: '',
      country: '',
    }
  }

  // Try to parse common address formats
  // Common patterns:
  // - "123 Main St, City, State ZIP"
  // - "123 Main St, City, State, ZIP"
  // - "123 Main St, City, State ZIP, Country"
  // - "123 Main St, City, State, ZIP, Country"
  const trimmed = addressValue.trim()

  // Split by commas
  const parts = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return {
      street: trimmed,
      extended: '',
      city: '',
      state: '',
      postal: '',
      country: '',
    }
  }

  // Try to extract components
  let street = ''
  let extended = ''
  let city = ''
  let state = ''
  let postal = ''
  let country = ''

  // Work backwards from the end to extract components
  // Typical format: "Street, City, State ZIP, Country"

  // 1. Check if last part is country (longer text, no numbers, not a state/ZIP)
  if (parts.length > 2) {
    const lastPart = parts[parts.length - 1]
    // Country is usually longer and doesn't contain numbers
    if (!/\d/.test(lastPart) && lastPart.length > 3) {
      country = lastPart
      parts.pop()
    }
  }

  if (parts.length === 0) {
    return {
      street: '',
      extended: '',
      city: '',
      state: '',
      postal: '',
      country,
    }
  }

  // 2. Check last part for ZIP code and state
  const lastPart = parts[parts.length - 1]

  // Try to match ZIP code pattern (5 digits or 5+4 format)
  const zipMatch = lastPart.match(/(\d{5}(?:-\d{4})?)$/)
  if (zipMatch) {
    postal = zipMatch[1]
    // Extract state (everything before the ZIP, trimmed)
    const statePart = lastPart.substring(0, zipMatch.index).trim()
    if (statePart) {
      state = statePart
      parts.pop()
    } else {
      // ZIP found but no state in same part, check previous part
      if (parts.length > 1) {
        const prevPart = parts[parts.length - 2]
        // If previous part is short (2-3 chars) or looks like a state abbreviation
        if (prevPart.length <= 3 || /^[A-Z]{2}$/i.test(prevPart)) {
          state = prevPart
          parts.splice(parts.length - 2, 1) // Remove state part
        }
      }
      // Remove the ZIP part
      parts.pop()
    }
  } else {
    // No ZIP in last part, check if it's a standalone ZIP or state
    // If it's just numbers, it might be a ZIP
    if (/^\d{5}(?:-\d{4})?$/.test(lastPart)) {
      postal = lastPart
      parts.pop()
      // Check previous part for state
      if (parts.length > 0) {
        const prevPart = parts[parts.length - 1]
        if (prevPart.length <= 3 || /^[A-Z]{2}$/i.test(prevPart)) {
          state = prevPart
          parts.pop()
        }
      }
    } else if (parts.length > 1) {
      // Last part might be state (short, 2-3 chars or common state length)
      const possibleState = lastPart
      if (possibleState.length <= 3 || /^[A-Z]{2}$/i.test(possibleState)) {
        state = possibleState
        parts.pop()
      }
    }
  }

  if (parts.length === 0) {
    return { street: '', extended: '', city: '', state, postal, country }
  }

  // 3. Last remaining part is city
  city = parts[parts.length - 1]
  parts.pop()

  // 4. If there are 2+ parts left, check if second-to-last might be address line 2
  // Address line 2 typically appears between street and city
  if (parts.length >= 2) {
    // Last part before city could be address line 2 (apartment, suite, etc.)
    const possibleExtended = parts[parts.length - 1]
    // Common indicators: Apt, Suite, Unit, #, Floor, Room, Building, etc.
    const extendedIndicators =
      /^(apt|apartment|suite|unit|ste|#|floor|fl|room|rm|bldg|building|po box|p\.?o\.?\s*box|box|p\.?m\.?\s*b\.?|pmb)/i
    // Also check if it's a short string that doesn't look like a city name
    // Cities are usually longer and don't start with numbers or special chars
    const looksLikeExtended =
      extendedIndicators.test(possibleExtended) ||
      (possibleExtended.length < 25 &&
        (possibleExtended.length <= 3 ||
          /^[#\d]/.test(possibleExtended) ||
          /^(apt|suite|unit|ste|#|fl|rm|bldg|box)/i.test(possibleExtended)))

    if (looksLikeExtended) {
      extended = possibleExtended
      parts.pop()
    }
  }

  // 5. Everything else is street address
  street = parts.join(', ')

  return {
    street: street || addressValue, // Fallback to original if parsing fails
    extended,
    city,
    state,
    postal,
    country,
  }
}

/**
 * Format structured address to vCard format: ;;street;extended;city;state;postal;country
 */
export function formatAddressForVCard(address: StructuredAddress): string {
  const parts = [
    '', // Post office box (empty)
    '', // Extended address (empty) - this is actually the first empty field
    address.street || '',
    address.extended || '', // Extended address (line 2)
    address.city || '',
    address.state || '',
    address.postal || '',
    address.country || '',
  ]
  return parts.join(';')
}

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
  error?: string | null
}

/**
 * Address input component with structured fields only
 * Formats addresses correctly for vCard (;;street;extended;city;state;postal;country)
 */
export function AddressInput({
  value,
  onChange,
  error,
}: AddressInputProps) {
  const [structured, setStructured] = useState<StructuredAddress>(() =>
    parseAddress(value || ''),
  )

  // Update structured address when value changes externally
  useEffect(() => {
    if (value) {
      const parsed = parseAddress(value)
      setStructured(parsed)
    } else {
      setStructured({
        street: '',
        extended: '',
        city: '',
        state: '',
        postal: '',
        country: '',
      })
    }
  }, [value])

  // Update parent when structured address changes
  useEffect(() => {
    const formatted = formatAddressForVCard(structured)
    onChange(formatted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structured])

  const updateField = (field: keyof StructuredAddress, newValue: string) => {
    setStructured((prev) => ({ ...prev, [field]: newValue }))
  }

  return (
    <div className="space-y-2">
      <Input
        name="street-address"
        autoComplete="street-address"
        placeholder="Street address"
        value={structured.street}
        onChange={(e) => updateField('street', e.target.value)}
        className={error ? 'border-red-500' : ''}
      />
      <Input
        name="address-line2"
        autoComplete="address-line2"
        placeholder="Apartment, suite, unit, etc. (optional)"
        value={structured.extended}
        onChange={(e) => updateField('extended', e.target.value)}
      />
      <div className="grid grid-cols-4 gap-2">
        <Input
          name="address-city"
          autoComplete="address-level2"
          placeholder="City"
          value={structured.city}
          onChange={(e) => updateField('city', e.target.value)}
          className="col-span-2"
        />
        <Input
          name="address-state"
          autoComplete="address-level1"
          placeholder="State"
          value={structured.state}
          onChange={(e) => updateField('state', e.target.value)}
        />
        <Input
          name="address-postal"
          autoComplete="postal-code"
          placeholder="ZIP"
          value={structured.postal}
          onChange={(e) => updateField('postal', e.target.value)}
        />
      </div>
      <Input
        name="address-country"
        autoComplete="country"
        placeholder="Country"
        value={structured.country}
        onChange={(e) => updateField('country', e.target.value)}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

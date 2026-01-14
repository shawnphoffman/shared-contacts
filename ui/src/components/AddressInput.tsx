import { useState, useEffect } from 'react'
import { Input } from './ui/input'
import { Field, FieldContent, FieldLabel } from './ui/field'
import { ChevronsLeftRightEllipsis } from 'lucide-react'
import { Button } from './ui/button'

/**
 * Structured address data
 */
export interface StructuredAddress {
  street: string
  city: string
  state: string
  postal: string
  country: string
}

/**
 * Parse vCard address format: ;;street;city;state;postal;country
 * Also handles plain text addresses
 */
export function parseAddress(addressValue: string): StructuredAddress {
  // Check if it's in vCard format (starts with ;;)
  if (addressValue.startsWith(';;')) {
    const parts = addressValue.split(';')
    return {
      street: parts[2] || '',
      city: parts[3] || '',
      state: parts[4] || '',
      postal: parts[5] || '',
      country: parts[6] || '',
    }
  }

  // If it's plain text, try to parse common formats
  // For now, just put everything in street and let user edit
  return {
    street: addressValue,
    city: '',
    state: '',
    postal: '',
    country: '',
  }
}

/**
 * Format structured address to vCard format: ;;street;city;state;postal;country
 */
export function formatAddressForVCard(address: StructuredAddress): string {
  const parts = [
    '', // Post office box (empty)
    '', // Extended address (empty)
    address.street || '',
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
  placeholder?: string
  error?: string | null
}

/**
 * Address input component with structured fields
 * Formats addresses correctly for vCard (;;street;city;state;postal;country)
 */
export function AddressInput({
  value,
  onChange,
  placeholder = 'Enter address',
  error,
}: AddressInputProps) {
  // Format value for display in simple mode (convert vCard format to readable)
  const getSimpleDisplayValue = (val: string): string => {
    if (!val) return ''
    if (val.startsWith(';;')) {
      // Parse vCard format and convert to readable
      const parsed = parseAddress(val)
      return [
        parsed.street,
        parsed.city,
        parsed.state,
        parsed.postal,
        parsed.country,
      ]
        .filter(Boolean)
        .join(', ')
    }
    return val
  }

  const [structured, setStructured] = useState<StructuredAddress>(() =>
    parseAddress(value || ''),
  )
  const [useStructured, setUseStructured] = useState(() => {
    // Use structured view if address is already in vCard format or has multiple components
    if (!value) return false
    const parsed = parseAddress(value)
    return (
      value.startsWith(';;') ||
      !!(parsed.city || parsed.state || parsed.postal || parsed.country)
    )
  })
  const [simpleValue, setSimpleValue] = useState(() =>
    getSimpleDisplayValue(value || ''),
  )

  // Update structured mode when switching
  const handleModeSwitch = (newMode: boolean) => {
    if (newMode && !useStructured) {
      // Switching to structured - parse current value
      const parsed = parseAddress(value || '')
      setStructured(parsed)
    } else if (!newMode && useStructured) {
      // Switching to simple - format current structured address as simple text
      const simpleValue = [
        structured.street,
        structured.city,
        structured.state,
        structured.postal,
        structured.country,
      ]
        .filter(Boolean)
        .join(', ')
      onChange(simpleValue)
    }
    setUseStructured(newMode)
  }

  // Update structured address when value changes externally or when switching modes
  useEffect(() => {
    if (value) {
      const parsed = parseAddress(value)
      setStructured(parsed)
    } else {
      setStructured({
        street: '',
        city: '',
        state: '',
        postal: '',
        country: '',
      })
    }
  }, [value])

  // Update simple value when external value changes
  useEffect(() => {
    if (!useStructured) {
      setSimpleValue(getSimpleDisplayValue(value || ''))
    }
  }, [value, useStructured])

  // Update parent when structured address changes
  useEffect(() => {
    if (useStructured) {
      const formatted = formatAddressForVCard(structured)
      onChange(formatted)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structured, useStructured])

  const updateField = (field: keyof StructuredAddress, newValue: string) => {
    setStructured((prev) => ({ ...prev, [field]: newValue }))
  }

  if (useStructured) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2">
            <Input
              placeholder="Street address"
              value={structured.street}
              onChange={(e) => updateField('street', e.target.value)}
              className={error ? 'border-red-500' : ''}
            />
            <div className="grid grid-cols-4 gap-2">
              <Input
                placeholder="City"
                value={structured.city}
                onChange={(e) => updateField('city', e.target.value)}
                className="col-span-2"
              />
              <Input
                placeholder="State"
                value={structured.state}
                onChange={(e) => updateField('state', e.target.value)}
              />
              <Input
                placeholder="ZIP"
                value={structured.postal}
                onChange={(e) => updateField('postal', e.target.value)}
              />
            </div>
            <Input
              placeholder="Country"
              value={structured.country}
              onChange={(e) => updateField('country', e.target.value)}
            />
          </div>

          <Button
            type="button"
            onClick={() => handleModeSwitch(false)}
            variant="outline"
            size="icon"
          >
            <ChevronsLeftRightEllipsis className="w-4 h-4" />
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Input
          type="text"
          value={simpleValue}
          onChange={(e) => {
            setSimpleValue(e.target.value)
            onChange(e.target.value)
          }}
          placeholder={placeholder}
          className={error ? 'border-red-500' : ''}
        />
        <Button
          type="button"
          onClick={() => handleModeSwitch(true)}
          variant="outline"
          size="icon"
        >
          <ChevronsLeftRightEllipsis className="w-4 h-4" />
        </Button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

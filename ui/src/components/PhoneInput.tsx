import { useState, useEffect, useRef } from 'react'
import {
  parsePhoneNumber,
  AsYouType,
  type CountryCode,
} from 'libphonenumber-js'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'

interface PhoneInputProps {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  id?: string
  name?: string
  autoComplete?: string
  className?: string
  placeholder?: string
  disabled?: boolean
  defaultCountry?: CountryCode
}

/**
 * Smart phone number input that formats numbers as you type
 * Handles country codes and formats numbers according to international standards
 */
export function PhoneInput({
  value = '',
  onChange,
  onBlur,
  id,
  name,
  autoComplete = 'tel',
  className,
  placeholder = 'Enter phone number',
  disabled = false,
  defaultCountry = 'US',
}: PhoneInputProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const [detectedCountry, setDetectedCountry] = useState<
    CountryCode | undefined
  >(defaultCountry)
  const inputRef = useRef<HTMLInputElement>(null)

  // Update display value when external value changes
  useEffect(() => {
    // Only update if the value prop actually changed (not from internal state)
    const currentFormatted = displayValue.replace(/\D/g, '')
    const newFormatted = value.replace(/\D/g, '')

    // If the digits are the same, don't update (to avoid loops)
    if (currentFormatted === newFormatted && value === displayValue) {
      return
    }

    // If value is empty, clear display
    if (!value) {
      setDisplayValue('')
      return
    }

    // Try to format the value for display
    try {
      // First try to parse as a complete number
      const phoneNumber = parsePhoneNumber(
        value,
        detectedCountry || defaultCountry,
      )
      if (phoneNumber.isValid()) {
        // Format for display
        setDisplayValue(phoneNumber.formatNational())
        if (phoneNumber.country) {
          setDetectedCountry(phoneNumber.country)
        }
      } else {
        // Try without country hint
        try {
          const phoneNumberIntl = parsePhoneNumber(value)
          if (phoneNumberIntl.isValid()) {
            setDisplayValue(phoneNumberIntl.formatInternational())
            if (phoneNumberIntl.country) {
              setDetectedCountry(phoneNumberIntl.country)
            }
          } else {
            // Use AsYouType formatter for partial numbers
            const formatter = new AsYouType(detectedCountry || defaultCountry)
            const formatted = formatter.input(value)
            setDisplayValue(formatted)
            if (formatter.country) {
              setDetectedCountry(formatter.country)
            }
          }
        } catch {
          // Use AsYouType formatter
          const formatter = new AsYouType(detectedCountry || defaultCountry)
          const formatted = formatter.input(value)
          setDisplayValue(formatted)
          if (formatter.country) {
            setDetectedCountry(formatter.country)
          }
        }
      }
    } catch {
      // If parsing fails, use AsYouType formatter
      try {
        const formatter = new AsYouType(detectedCountry || defaultCountry)
        const formatted = formatter.input(value)
        setDisplayValue(formatted)
        if (formatter.country) {
          setDetectedCountry(formatter.country)
        }
      } catch {
        // If all else fails, use value as-is
        setDisplayValue(value)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, defaultCountry])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value

    // Use AsYouType formatter for real-time formatting
    const formatter = new AsYouType(detectedCountry || defaultCountry)
    const formattedValue = formatter.input(inputValue)

    // Update detected country if formatter detected one
    if (formatter.country) {
      setDetectedCountry(formatter.country)
    }

    setDisplayValue(formattedValue)

    // Call onChange with the formatted value
    // Try to get E.164 format if we can parse it, otherwise use formatted value
    if (onChange) {
      try {
        const phoneNumber = parsePhoneNumber(
          inputValue,
          detectedCountry || defaultCountry,
        )
        // Use E.164 format if valid, otherwise use formatted value
        onChange(phoneNumber.isValid() ? phoneNumber.number : formattedValue)
      } catch {
        // If parsing fails, try without country hint
        try {
          const phoneNumber = parsePhoneNumber(inputValue)
          if (phoneNumber.isValid()) {
            onChange(phoneNumber.number)
          } else {
            onChange(formattedValue)
          }
        } catch {
          // If all parsing fails, use formatted value
          onChange(formattedValue)
        }
      }
    }
  }

  const handleBlur = () => {
    // On blur, try to format to a complete number if possible
    if (displayValue) {
      try {
        // Try parsing with detected/default country first
        const phoneNumber = parsePhoneNumber(
          displayValue,
          detectedCountry || defaultCountry,
        )
        if (phoneNumber.isValid()) {
          // Format as national format for display, but store E.164
          const formatted = phoneNumber.formatNational()
          setDisplayValue(formatted)
          if (onChange) {
            onChange(phoneNumber.number) // Store E.164 format
          }
          if (phoneNumber.country) {
            setDetectedCountry(phoneNumber.country)
          }
        } else {
          // Try without country hint
          try {
            const phoneNumberIntl = parsePhoneNumber(displayValue)
            if (phoneNumberIntl.isValid()) {
              const formatted = phoneNumberIntl.formatInternational()
              setDisplayValue(formatted)
              if (onChange) {
                onChange(phoneNumberIntl.number)
              }
              if (phoneNumberIntl.country) {
                setDetectedCountry(phoneNumberIntl.country)
              }
            }
          } catch {
            // Keep current value if parsing fails
          }
        }
      } catch {
        // Keep current value if parsing fails
      }
    }
    onBlur?.()
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      name={name}
      type="tel"
      autoComplete={autoComplete}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(className)}
    />
  )
}

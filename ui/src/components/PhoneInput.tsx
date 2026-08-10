import { useEffect, useState } from 'react'
import { Input } from './ui/input'
import type { CountryCode } from 'libphonenumber-js'
import { cn, formatPhoneAsYouType, formatPhoneNumber, formatSevenDigitPhone, formatValidPhoneNumber, toE164Phone } from '@/lib/utils'

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

const digitsOf = (value: string) => value.replace(/\D/g, '')

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
	const [displayValue, setDisplayValue] = useState(() => formatPhoneNumber(value, defaultCountry))

	// Reformat when the value changes externally. Same digits with the same
	// international prefix means the parent just echoed back what is already on
	// screen (usually the E.164 form), so leave the text under the cursor alone.
	useEffect(() => {
		if (digitsOf(displayValue) === digitsOf(value) && displayValue.trim().startsWith('+') === value.trim().startsWith('+')) {
			return
		}
		setDisplayValue(formatPhoneNumber(value, defaultCountry))
	}, [value, defaultCountry])

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputValue = e.target.value
		const formatted = formatPhoneAsYouType(inputValue, defaultCountry)

		setDisplayValue(formatted)
		// Store E.164 once the number is complete, otherwise keep the raw formatting
		onChange?.(toE164Phone(inputValue, defaultCountry) ?? formatted)
	}

	const handleBlur = () => {
		if (displayValue) {
			const sevenDigit = formatSevenDigitPhone(displayValue)
			if (sevenDigit) {
				setDisplayValue(sevenDigit)
				onChange?.(sevenDigit)
			} else {
				const formatted = formatValidPhoneNumber(displayValue, defaultCountry)
				const e164 = toE164Phone(displayValue, defaultCountry)
				if (formatted && e164) {
					setDisplayValue(formatted)
					onChange?.(e164)
				}
			}
		}
		onBlur?.()
	}

	return (
		<Input
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

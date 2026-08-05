import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

const NONE_VALUE = '__none__'

export interface OptionSelectOption {
	value: string
	label: string
}

interface OptionSelectProps {
	id?: string
	value: string
	onChange: (value: string) => void
	options: Array<string | OptionSelectOption>
	placeholder: string
	className?: string
}

/**
 * Single-value select over a fixed option list, with a "None" item that clears
 * the value. Values not in the list (e.g. from synced vCards) are preserved by
 * prepending them as an option.
 */
export function OptionSelect({ id, value, onChange, options, placeholder, className }: OptionSelectProps) {
	const normalized = options.map(option => (typeof option === 'string' ? { value: option, label: option } : option))
	const allOptions =
		value !== '' && !normalized.some(option => option.value === value) ? [{ value, label: value }, ...normalized] : normalized
	return (
		<Select value={value} onValueChange={v => onChange(v === NONE_VALUE ? '' : v)}>
			<SelectTrigger id={id} className={className ?? 'w-full'}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NONE_VALUE}>None</SelectItem>
				{allOptions.map(option => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

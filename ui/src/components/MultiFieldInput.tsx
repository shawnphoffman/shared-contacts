import { Button } from './ui/button'
import { Input } from './ui/input'
import { Field, FieldContent, FieldLabel } from './ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import type { ContactField } from '../lib/db'

interface MultiFieldInputProps {
	label: string
	fields: Array<ContactField>
	onChange: (fields: Array<ContactField>) => void
	placeholder?: string
	typeOptions?: Array<string>
	defaultType?: string
	inputType?: 'text' | 'email' | 'tel' | 'url'
	renderInput?: (field: ContactField, index: number, onChange: (value: string) => void) => React.ReactNode
}

type InputType = NonNullable<MultiFieldInputProps['inputType']>

const DEFAULT_TYPE_OPTIONS: Record<InputType, Array<string>> = {
	text: ['HOME', 'WORK', 'OTHER'],
	tel: ['CELL', 'WORK', 'HOME', 'FAX', 'OTHER'],
	email: ['INTERNET', 'WORK', 'HOME', 'OTHER'],
	url: ['HOME', 'WORK', 'OTHER'],
}

export function MultiFieldInput({
	label,
	fields,
	onChange,
	placeholder,
	typeOptions,
	defaultType = 'HOME',
	inputType = 'text',
	renderInput,
}: MultiFieldInputProps) {
	const addField = () => {
		onChange([...fields, { value: '', type: defaultType }])
	}

	const removeField = (index: number) => {
		onChange(fields.filter((_, i) => i !== index))
	}

	const updateField = (index: number, updates: Partial<ContactField>) => {
		const newFields = [...fields]
		newFields[index] = { ...newFields[index], ...updates }
		onChange(newFields)
	}

	const options = typeOptions ?? DEFAULT_TYPE_OPTIONS[inputType]

	return (
		<Field>
			<div className="flex items-center justify-between w-full">
				<FieldLabel>{label}</FieldLabel>
				<Button type="button" variant="outline" size="sm" onClick={addField}>
					+ Add
				</Button>
			</div>
			<FieldContent>
				{fields.length === 0 ? (
					<div className="text-sm text-muted-foreground py-2">No {label.toLowerCase()} added. Click &ldquo;Add&rdquo; to add one.</div>
				) : (
					<div className="space-y-3">
						{fields.map((field, index) => (
							<div key={index} className="rounded-lg border bg-muted/30 p-3 space-y-2">
								<div className="flex gap-2 items-center">
									<Select value={field.type || defaultType} onValueChange={value => updateField(index, { type: value })}>
										<SelectTrigger className="w-[100px] sm:w-[120px] h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{options.map(option => (
												<SelectItem key={option} value={option}>
													{option}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<div className="flex-1" />
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => removeField(index)}
										className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
										title="Remove"
									>
										<span className="text-sm">Remove</span>
									</Button>
								</div>
								{renderInput ? (
									renderInput(field, index, value => updateField(index, { value }))
								) : (
									<Input
										type={inputType}
										value={field.value}
										onChange={e => updateField(index, { value: e.target.value })}
										placeholder={placeholder}
									/>
								)}
							</div>
						))}
					</div>
				)}
			</FieldContent>
		</Field>
	)
}

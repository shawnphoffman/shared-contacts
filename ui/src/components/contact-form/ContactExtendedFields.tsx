import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Field, FieldContent, FieldLabel } from '../ui/field'
import { MultiFieldInput } from '../MultiFieldInput'
import type { ContactField } from '../../lib/db'

interface ContactExtendedFieldsProps {
	labels: Array<ContactField>
	onLabelsChange: (labels: Array<ContactField>) => void
	logos: Array<ContactField>
	onLogosChange: (logos: Array<ContactField>) => void
	sounds: Array<ContactField>
	onSoundsChange: (sounds: Array<ContactField>) => void
	keys: Array<ContactField>
	onKeysChange: (keys: Array<ContactField>) => void
	customFields: Array<{ key: string; value: string; params?: Array<string> }>
	onCustomFieldsChange: (fields: Array<{ key: string; value: string; params?: Array<string> }>) => void
	showAdvanced: boolean
}

export function ContactExtendedFields({
	labels,
	onLabelsChange,
	logos,
	onLogosChange,
	sounds,
	onSoundsChange,
	keys,
	onKeysChange,
	customFields,
	onCustomFieldsChange,
	showAdvanced,
}: ContactExtendedFieldsProps) {
	const hasLabels = labels.some(label => label.value.trim())
	const hasLogos = logos.some(logo => logo.value.trim())
	const hasSounds = sounds.some(sound => sound.value.trim())
	const hasKeys = keys.some(key => key.value.trim())
	const hasCustomFields = customFields.some(field => field.key.trim() || field.value.trim())

	const shouldShowAdvancedField = (hasValue: boolean) => showAdvanced || hasValue

	const addCustomField = () => {
		onCustomFieldsChange([...customFields, { key: '', value: '' }])
	}

	const updateCustomField = (index: number, updates: Partial<{ key: string; value: string; params?: Array<string> }>) => {
		const next = [...customFields]
		next[index] = { ...next[index], ...updates }
		onCustomFieldsChange(next)
	}

	const removeCustomField = (index: number) => {
		onCustomFieldsChange(customFields.filter((_, i) => i !== index))
	}

	return (
		<>
			{shouldShowAdvancedField(hasLabels) && (
				<MultiFieldInput
					label="Labels"
					fields={labels}
					onChange={onLabelsChange}
					placeholder="Label"
					inputType="text"
					defaultType="HOME"
					typeOptions={['HOME', 'WORK', 'OTHER']}
				/>
			)}

			{shouldShowAdvancedField(hasLogos) && (
				<MultiFieldInput
					label="Logos"
					fields={logos}
					onChange={onLogosChange}
					placeholder="Logo URL or data"
					inputType="url"
					defaultType="URI"
					typeOptions={['URI', 'PNG', 'JPEG', 'OTHER']}
				/>
			)}

			{shouldShowAdvancedField(hasSounds) && (
				<MultiFieldInput
					label="Sounds"
					fields={sounds}
					onChange={onSoundsChange}
					placeholder="Sound URL or data"
					inputType="url"
					defaultType="URI"
					typeOptions={['URI', 'WAV', 'MP3', 'OTHER']}
				/>
			)}

			{shouldShowAdvancedField(hasKeys) && (
				<MultiFieldInput
					label="Keys"
					fields={keys}
					onChange={onKeysChange}
					placeholder="Key data or URL"
					inputType="text"
					defaultType="PGP"
					typeOptions={['PGP', 'X509', 'OTHER']}
				/>
			)}

			{shouldShowAdvancedField(hasCustomFields) && (
				<Field>
					<div className="flex items-center justify-between w-full">
						<FieldLabel>Custom Fields</FieldLabel>
						<Button type="button" variant="outline" size="sm" onClick={addCustomField}>
							+ Add
						</Button>
					</div>
					<FieldContent>
						{customFields.length === 0 ? (
							<div className="text-sm text-muted-foreground py-2">No custom fields added.</div>
						) : (
							<div className="space-y-2">
								{customFields.map((field, index) => (
									<div key={index} className="flex gap-2 items-start">
										<div className="flex-1 grid grid-cols-2 gap-2">
											<Input
												value={field.key}
												onChange={e => updateCustomField(index, { key: e.target.value })}
												placeholder="X-CUSTOM-NAME"
											/>
											<Input value={field.value} onChange={e => updateCustomField(index, { value: e.target.value })} placeholder="Value" />
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeCustomField(index)}
											className="text-destructive hover:text-destructive hover:bg-destructive/10"
											title="Remove"
										>
											<span className="text-lg leading-none">×</span>
										</Button>
									</div>
								))}
							</div>
						)}
					</FieldContent>
				</Field>
			)}
		</>
	)
}

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Field, FieldContent, FieldLabel } from '../ui/field'

interface ContactAdvancedFieldsProps {
	formData: {
		middle_name: string
		name_prefix: string
		name_suffix: string
		maiden_name: string
		role: string
		mailer: string
		time_zone: string
		geo: string
		agent: string
		prod_id: string
		revision: string
		sort_string: string
		class: string
	}
	onFormDataChange: (updates: Partial<ContactAdvancedFieldsProps['formData']>) => void
	orgUnitsInput: string
	onOrgUnitsInputChange: (value: string) => void
	categoriesInput: string
	onCategoriesInputChange: (value: string) => void
	showAdvanced: boolean
	onToggleAdvanced: () => void
}

export function ContactAdvancedFields({
	formData,
	onFormDataChange,
	orgUnitsInput,
	onOrgUnitsInputChange,
	categoriesInput,
	onCategoriesInputChange,
	showAdvanced,
	onToggleAdvanced,
}: ContactAdvancedFieldsProps) {
	const hasMiddleName = formData.middle_name.trim() !== ''
	const hasNamePrefix = formData.name_prefix.trim() !== ''
	const hasNameSuffix = formData.name_suffix.trim() !== ''
	const hasMaidenName = formData.maiden_name.trim() !== ''
	const hasRole = formData.role.trim() !== ''
	const hasMailer = formData.mailer.trim() !== ''
	const hasTimeZone = formData.time_zone.trim() !== ''
	const hasGeo = formData.geo.trim() !== ''
	const hasAgent = formData.agent.trim() !== ''
	const hasProdId = formData.prod_id.trim() !== ''
	const hasRevision = formData.revision.trim() !== ''
	const hasSortString = formData.sort_string.trim() !== ''
	const hasClass = formData.class.trim() !== ''
	const hasOrgUnits = orgUnitsInput.trim() !== ''
	const hasCategories = categoriesInput.trim() !== ''

	const shouldShowAdvancedField = (hasValue: boolean) => showAdvanced || hasValue

	return (
		<>
			<div className="flex items-center justify-between">
				<span className="text-sm text-muted-foreground">Advanced fields</span>
				<Button
					type="button"
					variant={showAdvanced ? 'default' : 'outline'}
					size="sm"
					aria-pressed={showAdvanced}
					onClick={onToggleAdvanced}
				>
					{showAdvanced ? 'Hide advanced fields' : 'Show advanced fields'}
				</Button>
			</div>

			{(shouldShowAdvancedField(hasNamePrefix) ||
				shouldShowAdvancedField(hasNameSuffix) ||
				shouldShowAdvancedField(hasMiddleName) ||
				shouldShowAdvancedField(hasMaidenName)) && (
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{shouldShowAdvancedField(hasNamePrefix) && (
						<Field>
							<FieldLabel htmlFor="name_prefix">Name Prefix</FieldLabel>
							<FieldContent>
								<Input
									id="name_prefix"
									name="name_prefix"
									autoComplete="honorific-prefix"
									value={formData.name_prefix}
									onChange={e => onFormDataChange({ name_prefix: e.target.value })}
									placeholder="Dr., Ms., etc."
								/>
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasNameSuffix) && (
						<Field>
							<FieldLabel htmlFor="name_suffix">Name Suffix</FieldLabel>
							<FieldContent>
								<Input
									id="name_suffix"
									name="name_suffix"
									autoComplete="honorific-suffix"
									value={formData.name_suffix}
									onChange={e => onFormDataChange({ name_suffix: e.target.value })}
									placeholder="Jr., III, etc."
								/>
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasMiddleName) && (
						<Field>
							<FieldLabel htmlFor="middle_name">Middle Name</FieldLabel>
							<FieldContent>
								<Input
									id="middle_name"
									name="middle_name"
									autoComplete="additional-name"
									value={formData.middle_name}
									onChange={e => onFormDataChange({ middle_name: e.target.value })}
								/>
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasMaidenName) && (
						<Field>
							<FieldLabel htmlFor="maiden_name">Maiden Name</FieldLabel>
							<FieldContent>
								<Input
									id="maiden_name"
									name="maiden_name"
									value={formData.maiden_name}
									onChange={e => onFormDataChange({ maiden_name: e.target.value })}
								/>
							</FieldContent>
						</Field>
					)}
				</div>
			)}

			{(shouldShowAdvancedField(hasRole) ||
				shouldShowAdvancedField(hasMailer) ||
				shouldShowAdvancedField(hasTimeZone) ||
				shouldShowAdvancedField(hasGeo)) && (
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{shouldShowAdvancedField(hasRole) && (
						<Field>
							<FieldLabel htmlFor="role">Role</FieldLabel>
							<FieldContent>
								<Input id="role" name="role" value={formData.role} onChange={e => onFormDataChange({ role: e.target.value })} />
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasMailer) && (
						<Field>
							<FieldLabel htmlFor="mailer">Mailer</FieldLabel>
							<FieldContent>
								<Input
									id="mailer"
									name="mailer"
									value={formData.mailer}
									onChange={e => onFormDataChange({ mailer: e.target.value })}
								/>
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasTimeZone) && (
						<Field>
							<FieldLabel htmlFor="time_zone">Time Zone</FieldLabel>
							<FieldContent>
								<Input
									id="time_zone"
									name="time_zone"
									value={formData.time_zone}
									onChange={e => onFormDataChange({ time_zone: e.target.value })}
									placeholder="e.g. America/Los_Angeles"
								/>
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasGeo) && (
						<Field>
							<FieldLabel htmlFor="geo">Geo</FieldLabel>
							<FieldContent>
								<Input
									id="geo"
									name="geo"
									value={formData.geo}
									onChange={e => onFormDataChange({ geo: e.target.value })}
									placeholder="lat;long"
								/>
							</FieldContent>
						</Field>
					)}
				</div>
			)}

			{(shouldShowAdvancedField(hasAgent) ||
				shouldShowAdvancedField(hasProdId) ||
				shouldShowAdvancedField(hasRevision) ||
				shouldShowAdvancedField(hasSortString) ||
				shouldShowAdvancedField(hasClass)) && (
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{shouldShowAdvancedField(hasAgent) && (
						<Field>
							<FieldLabel htmlFor="agent">Agent</FieldLabel>
							<FieldContent>
								<Input id="agent" name="agent" value={formData.agent} onChange={e => onFormDataChange({ agent: e.target.value })} />
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasProdId) && (
						<Field>
							<FieldLabel htmlFor="prod_id">Product ID</FieldLabel>
							<FieldContent>
								<Input
									id="prod_id"
									name="prod_id"
									value={formData.prod_id}
									onChange={e => onFormDataChange({ prod_id: e.target.value })}
								/>
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasRevision) && (
						<Field>
							<FieldLabel htmlFor="revision">Revision</FieldLabel>
							<FieldContent>
								<Input
									id="revision"
									name="revision"
									value={formData.revision}
									onChange={e => onFormDataChange({ revision: e.target.value })}
									placeholder="YYYY-MM-DDThh:mm:ssZ"
								/>
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasSortString) && (
						<Field>
							<FieldLabel htmlFor="sort_string">Sort String</FieldLabel>
							<FieldContent>
								<Input
									id="sort_string"
									name="sort_string"
									value={formData.sort_string}
									onChange={e => onFormDataChange({ sort_string: e.target.value })}
								/>
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasClass) && (
						<Field>
							<FieldLabel htmlFor="class">Class</FieldLabel>
							<FieldContent>
								<Input
									id="class"
									name="class"
									value={formData.class}
									onChange={e => onFormDataChange({ class: e.target.value })}
									placeholder="PUBLIC, PRIVATE, or CONFIDENTIAL"
								/>
							</FieldContent>
						</Field>
					)}
				</div>
			)}

			{(shouldShowAdvancedField(hasOrgUnits) || shouldShowAdvancedField(hasCategories)) && (
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{shouldShowAdvancedField(hasOrgUnits) && (
						<Field>
							<FieldLabel htmlFor="org_units">Organization Units</FieldLabel>
							<FieldContent>
								<Input
									id="org_units"
									name="org_units"
									value={orgUnitsInput}
									onChange={e => onOrgUnitsInputChange(e.target.value)}
									placeholder="Unit 1, Unit 2"
								/>
							</FieldContent>
						</Field>
					)}
					{shouldShowAdvancedField(hasCategories) && (
						<Field>
							<FieldLabel htmlFor="categories">Categories</FieldLabel>
							<FieldContent>
								<Input
									id="categories"
									name="categories"
									value={categoriesInput}
									onChange={e => onCategoriesInputChange(e.target.value)}
									placeholder="Friends, Work, VIP"
								/>
							</FieldContent>
						</Field>
					)}
				</div>
			)}
		</>
	)
}

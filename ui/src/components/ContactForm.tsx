import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Field, FieldContent, FieldLabel } from './ui/field'
import { PhoneInput } from './PhoneInput'
import { MultiFieldInput } from './MultiFieldInput'
import { AddressInput } from './AddressInput'
import { Checkbox } from './ui/checkbox'
import { ContactAdvancedFields, ContactExtendedFields, ContactPhotoSection } from './contact-form'
import { useContactForm } from './contact-form/useContactForm'
import type { ContactPayload } from './contact-form/useContactForm'
import type { Contact } from '../lib/db'

export type { ContactPayload }

interface ContactFormProps {
	contact?: Contact
	onSubmit: (data: ContactPayload) => Promise<void>
	onCancel?: () => void
}

export function ContactForm({ contact, onSubmit, onCancel }: ContactFormProps) {
	const form = useContactForm(contact)
	const [showAdvanced, setShowAdvanced] = useState(false)
	const {
		formData,
		setFormData,
		fullName,
		phones,
		setPhones,
		emails,
		addresses,
		setAddresses,
		urls,
		labels,
		setLabels,
		logos,
		setLogos,
		sounds,
		setSounds,
		keys,
		setKeys,
		customFields,
		setCustomFields,
		orgUnitsInput,
		setOrgUnitsInput,
		categoriesInput,
		setCategoriesInput,
		validationErrors,
		handleEmailsChange,
		handleUrlsChange,
		validateAll,
		existingPhotoUrl,
		photoPreviewUrl,
		showExistingPhoto,
		setShowExistingPhoto,
		handlePhotoFileChange,
		handleRemovePhoto,
		isCropOpen,
		cropSource,
		crop,
		setCrop,
		zoom,
		setZoom,
		setCroppedAreaPixels,
		handleCropSave,
		handleCropCancel,
		addressBooks,
		selectedBookIds,
		setSelectedBookIds,
		isSubmitting,
		setIsSubmitting,
		buildPayload,
	} = form

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		if (!validateAll()) {
			const firstErrorField = document.querySelector('.border-red-500')
			if (firstErrorField) {
				firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' })
			}
			return
		}

		setIsSubmitting(true)
		try {
			await onSubmit(buildPayload({ includeAddressBooks: true }))
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			{/* Photo */}
			<ContactPhotoSection
				photoPreviewUrl={photoPreviewUrl}
				existingPhotoUrl={existingPhotoUrl}
				showExistingPhoto={showExistingPhoto}
				onShowExistingPhotoChange={setShowExistingPhoto}
				onPhotoFileChange={handlePhotoFileChange}
				onRemovePhoto={handleRemovePhoto}
				isCropOpen={isCropOpen}
				cropSource={cropSource}
				crop={crop}
				zoom={zoom}
				onCropChange={setCrop}
				onZoomChange={setZoom}
				onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
				onCropSave={handleCropSave}
				onCropCancel={handleCropCancel}
			/>

			{/* Name */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Name</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<Field>
							<FieldLabel htmlFor="first_name">First Name</FieldLabel>
							<FieldContent>
								<Input
									id="first_name"
									name="first_name"
									autoComplete="given-name"
									value={formData.first_name}
									onChange={e => setFormData({ ...formData, first_name: e.target.value })}
								/>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="last_name">Last Name</FieldLabel>
							<FieldContent>
								<Input
									id="last_name"
									name="last_name"
									autoComplete="family-name"
									value={formData.last_name}
									onChange={e => setFormData({ ...formData, last_name: e.target.value })}
								/>
							</FieldContent>
						</Field>
					</div>
					<Field>
						<FieldLabel htmlFor="nickname">Nickname</FieldLabel>
						<FieldContent>
							<Input
								id="nickname"
								name="nickname"
								autoComplete="nickname"
								value={formData.nickname}
								onChange={e => setFormData({ ...formData, nickname: e.target.value })}
								placeholder="Optional"
							/>
						</FieldContent>
					</Field>
					{fullName && (
						<p className="text-sm text-muted-foreground">
							Full name: <span className="font-medium text-foreground">{fullName}</span>
						</p>
					)}
				</CardContent>
			</Card>

			{/* Contact Info */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Contact Info</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<MultiFieldInput
						label="Phone Numbers"
						fields={phones}
						onChange={setPhones}
						placeholder="Enter phone number"
						inputType="tel"
						defaultType="CELL"
						renderInput={(field, index, onChange) => (
							<PhoneInput
								name={`phone-${index}`}
								autoComplete="tel"
								value={field.value}
								onChange={onChange}
								placeholder="Enter phone number"
								defaultCountry="US"
							/>
						)}
					/>
					<MultiFieldInput
						label="Email Addresses"
						fields={emails}
						onChange={handleEmailsChange}
						placeholder="Enter email address"
						inputType="email"
						defaultType="INTERNET"
						renderInput={(field, index, onChange) => (
							<div className="flex-1">
								<Input
									type="email"
									name={`email-${index}`}
									autoComplete="email"
									value={field.value}
									onChange={e => onChange(e.target.value)}
									placeholder="Enter email address"
									className={validationErrors.emails?.[index] ? 'border-red-500' : ''}
								/>
								{validationErrors.emails?.[index] && <p className="text-sm text-red-500 mt-1">{validationErrors.emails[index]}</p>}
							</div>
						)}
					/>
					<MultiFieldInput
						label="URLs / Websites"
						fields={urls}
						onChange={handleUrlsChange}
						placeholder="example.com or https://example.com"
						inputType="url"
						defaultType="HOME"
						renderInput={(field, index, onChange) => (
							<div className="flex-1">
								<Input
									type="url"
									name={`url-${index}`}
									autoComplete="url"
									value={field.value}
									onChange={e => onChange(e.target.value)}
									placeholder="example.com or https://example.com"
									className={validationErrors.urls?.[index] ? 'border-red-500' : ''}
								/>
								{validationErrors.urls?.[index] && <p className="text-sm text-red-500 mt-1">{validationErrors.urls[index]}</p>}
							</div>
						)}
					/>
				</CardContent>
			</Card>

			{/* Work */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Work</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<Field>
							<FieldLabel htmlFor="organization">Organization</FieldLabel>
							<FieldContent>
								<Input
									id="organization"
									name="organization"
									autoComplete="organization"
									value={formData.organization}
									onChange={e => setFormData({ ...formData, organization: e.target.value })}
								/>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="job_title">Job Title</FieldLabel>
							<FieldContent>
								<Input
									id="job_title"
									name="job_title"
									autoComplete="organization-title"
									value={formData.job_title}
									onChange={e => setFormData({ ...formData, job_title: e.target.value })}
								/>
							</FieldContent>
						</Field>
					</div>
				</CardContent>
			</Card>

			{/* Addresses */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Addresses</CardTitle>
				</CardHeader>
				<CardContent>
					<MultiFieldInput
						label="Addresses"
						fields={addresses}
						onChange={setAddresses}
						placeholder="Enter address"
						inputType="text"
						defaultType="HOME"
						renderInput={(field, _index, onChange) => (
							<div className="flex-1">
								<AddressInput value={field.value} onChange={onChange} />
							</div>
						)}
					/>
				</CardContent>
			</Card>

			{/* Other Details */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Other Details</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<Field>
						<FieldLabel htmlFor="birthday">Birthday</FieldLabel>
						<FieldContent>
							<Input
								id="birthday"
								name="birthday"
								type="date"
								autoComplete="bday"
								value={formData.birthday}
								onChange={e => setFormData({ ...formData, birthday: e.target.value })}
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="notes">Notes</FieldLabel>
						<FieldContent>
							<Textarea id="notes" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={4} />
						</FieldContent>
					</Field>
				</CardContent>
			</Card>

			{/* Address Books */}
			{addressBooks.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Address Books</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col gap-2">
							{addressBooks.map(book => {
								const checked = selectedBookIds.includes(book.id)
								return (
									<label key={book.id} className="flex items-center gap-2">
										<Checkbox
											checked={checked}
											onCheckedChange={value => {
												setSelectedBookIds(prev => {
													if (value) {
														return prev.includes(book.id) ? prev : [...prev, book.id]
													}
													return prev.filter(id => id !== book.id)
												})
											}}
										/>
										<span>{book.name}</span>
										{book.is_public && <span className="text-xs text-muted-foreground">(public)</span>}
									</label>
								)
							})}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Advanced */}
			<ContactAdvancedFields
				formData={formData}
				onFormDataChange={updates => setFormData(prev => ({ ...prev, ...updates }))}
				orgUnitsInput={orgUnitsInput}
				onOrgUnitsInputChange={setOrgUnitsInput}
				categoriesInput={categoriesInput}
				onCategoriesInputChange={setCategoriesInput}
				showAdvanced={showAdvanced}
				onToggleAdvanced={() => setShowAdvanced(prev => !prev)}
			/>

			<ContactExtendedFields
				labels={labels}
				onLabelsChange={setLabels}
				logos={logos}
				onLogosChange={setLogos}
				sounds={sounds}
				onSoundsChange={setSounds}
				keys={keys}
				onKeysChange={setKeys}
				customFields={customFields}
				onCustomFieldsChange={setCustomFields}
				showAdvanced={showAdvanced}
			/>

			{/* Actions */}
			<div className="flex gap-2 justify-end sticky bottom-0 bg-background py-4 border-t -mx-6 px-6 sm:mx-0 sm:px-0 sm:border-0 sm:relative sm:py-0 sm:bg-transparent">
				{onCancel && (
					<Button type="button" variant="outline" onClick={onCancel}>
						Cancel
					</Button>
				)}
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : contact ? 'Update' : 'Create'}
				</Button>
			</div>
		</form>
	)
}

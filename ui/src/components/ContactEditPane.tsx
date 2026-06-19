import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Field, FieldContent, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { MultiFieldInput } from './MultiFieldInput'
import { PhoneInput } from './PhoneInput'
import { AddressInput } from './AddressInput'
import { ContactAdvancedFields, ContactExtendedFields, ContactPhotoSection } from './contact-form'
import type { UseContactForm } from './contact-form/useContactForm'

interface ContactEditPaneProps {
	form: UseContactForm
}

/**
 * The Edit tab of the contact editor: every supported field, with the less
 * common ones tucked behind a progressive-disclosure section. Contains no
 * Save/Cancel controls; those live on the tab row of the surrounding page.
 */
export function ContactEditPane({ form }: ContactEditPaneProps) {
	const {
		formData,
		setFormData,
		phones,
		setPhones,
		emails,
		handleEmailsChange,
		addresses,
		setAddresses,
		urls,
		handleUrlsChange,
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
		addressBooks,
		selectedBookIds,
		setSelectedBookIds,
		validationErrors,
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
	} = form

	// Reveal the secondary fields up front when the contact already uses any of
	// them, otherwise keep the form focused on the primary fields.
	const hasSecondaryValues = Boolean(
		formData.organization ||
		formData.job_title ||
		formData.notes ||
		urls.some(u => u.value.trim()) ||
		orgUnitsInput.trim() ||
		categoriesInput.trim() ||
		labels.length ||
		logos.length ||
		sounds.length ||
		keys.length ||
		customFields.length
	)
	const [showMore, setShowMore] = useState(hasSecondaryValues)
	const [showAdvanced, setShowAdvanced] = useState(false)

	return (
		<div className="space-y-5">
			{/* Photo */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Photo</CardTitle>
				</CardHeader>
				<CardContent>
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
				</CardContent>
			</Card>

			{/* Name */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Name</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="first_name">First</FieldLabel>
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
							<FieldLabel htmlFor="last_name">Last</FieldLabel>
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
				</CardContent>
			</Card>

			{/* Email */}
			<Card>
				<CardContent className="pt-6">
					<MultiFieldInput
						label="Email"
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
								{validationErrors.emails?.[index] && <p className="mt-1 text-sm text-red-500">{validationErrors.emails[index]}</p>}
							</div>
						)}
					/>
				</CardContent>
			</Card>

			{/* Phone */}
			<Card>
				<CardContent className="pt-6">
					<MultiFieldInput
						label="Phone"
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
				</CardContent>
			</Card>

			{/* Address */}
			<Card>
				<CardContent className="pt-6">
					<MultiFieldInput
						label="Address"
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

			{/* Birthday */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Birthday</CardTitle>
				</CardHeader>
				<CardContent>
					<Field>
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
				</CardContent>
			</Card>

			{/* Address Books */}
			{addressBooks.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Address Books</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col gap-2.5">
							{addressBooks.map(book => {
								const checked = selectedBookIds.includes(book.id)
								return (
									<label key={book.id} className="flex items-center gap-2 text-sm">
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

			{!showMore ? (
				<button
					type="button"
					onClick={() => setShowMore(true)}
					className="w-full rounded-2xl border border-dashed p-5 text-left text-sm text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
				>
					+ Add organization, job title, URL, or note
				</button>
			) : (
				<>
					{/* Work */}
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Work</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

					{/* URLs */}
					<Card>
						<CardContent className="pt-6">
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
										{validationErrors.urls?.[index] && <p className="mt-1 text-sm text-red-500">{validationErrors.urls[index]}</p>}
									</div>
								)}
							/>
						</CardContent>
					</Card>

					{/* Notes */}
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Notes</CardTitle>
						</CardHeader>
						<CardContent>
							<Field>
								<FieldContent>
									<Textarea
										id="notes"
										value={formData.notes}
										onChange={e => setFormData({ ...formData, notes: e.target.value })}
										rows={4}
									/>
								</FieldContent>
							</Field>
						</CardContent>
					</Card>

					{/* Advanced vCard fields */}
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
				</>
			)}
		</div>
	)
}

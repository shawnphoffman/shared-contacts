import { useState, useEffect, useRef } from 'react'
import Cropper from 'react-easy-crop'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Field, FieldContent, FieldLabel } from './ui/field'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { PhoneInput } from './PhoneInput'
import { MultiFieldInput } from './MultiFieldInput'
import { AddressInput, parseAddress } from './AddressInput'
import { validateEmail, validateUrl, normalizeUrl } from '../lib/validation'
import { normalizePhoneNumber } from '../lib/utils'
import { cropToSquareDataUrl, getContactPhotoUrl, readFileAsDataUrl, type CropArea } from '../lib/image'
import type { Contact, ContactField } from '../lib/db'

export type ContactPayload = Partial<Contact> & {
	photo_data?: string
	photo_mime?: string | null
	photo_width?: number | null
	photo_height?: number | null
	photo_remove?: boolean
}

interface ContactFormProps {
	contact?: Contact
	onSubmit: (data: ContactPayload) => Promise<void>
	onCancel?: () => void
}

export function ContactForm({ contact, onSubmit, onCancel }: ContactFormProps) {
	// Format birthday for date input (YYYY-MM-DD)
	const formatDateForInput = (date: Date | null | undefined): string => {
		if (!date) return ''
		const d = new Date(date)
		const year = d.getFullYear()
		const month = String(d.getMonth() + 1).padStart(2, '0')
		const day = String(d.getDate()).padStart(2, '0')
		return `${year}-${month}-${day}`
	}

	// Initialize arrays from contact, or migrate from single values
	// Always return at least one empty field so users don't need to click "+"
	const initializeArray = (
		array: ContactField[] | null | undefined,
		singleValue: string | null | undefined,
		defaultType: string
	): ContactField[] => {
		if (array && array.length > 0) {
			return array
		}
		if (singleValue) {
			return [{ value: singleValue, type: defaultType }]
		}
		// Always return at least one empty field
		return [{ value: '', type: defaultType }]
	}

	const initializeOptionalArray = (array: ContactField[] | null | undefined): ContactField[] => {
		if (array && array.length > 0) {
			return array
		}
		return []
	}

	const [formData, setFormData] = useState({
		first_name: contact?.first_name || '',
		last_name: contact?.last_name || '',
		middle_name: contact?.middle_name || '',
		name_prefix: contact?.name_prefix || '',
		name_suffix: contact?.name_suffix || '',
		nickname: contact?.nickname || '',
		maiden_name: contact?.maiden_name || '',
		organization: contact?.organization || '',
		job_title: contact?.job_title || '',
		role: contact?.role || '',
		mailer: contact?.mailer || '',
		time_zone: contact?.time_zone || '',
		geo: contact?.geo || '',
		agent: contact?.agent || '',
		prod_id: contact?.prod_id || '',
		revision: contact?.revision || '',
		sort_string: contact?.sort_string || '',
		class: contact?.class || '',
		notes: contact?.notes || '',
		birthday: formatDateForInput(contact?.birthday),
	})

	const [phones, setPhones] = useState<ContactField[]>(initializeArray(contact?.phones, contact?.phone, 'CELL'))
	const [emails, setEmails] = useState<ContactField[]>(initializeArray(contact?.emails, contact?.email, 'INTERNET'))
	const [addresses, setAddresses] = useState<ContactField[]>(initializeArray(contact?.addresses, contact?.address, 'HOME'))
	const [urls, setUrls] = useState<ContactField[]>(initializeArray(contact?.urls, contact?.homepage, 'HOME'))
	const [labels, setLabels] = useState<ContactField[]>(initializeOptionalArray(contact?.labels))
	const [logos, setLogos] = useState<ContactField[]>(initializeOptionalArray(contact?.logos))
	const [sounds, setSounds] = useState<ContactField[]>(initializeOptionalArray(contact?.sounds))
	const [keys, setKeys] = useState<ContactField[]>(initializeOptionalArray(contact?.keys))
	const [customFields, setCustomFields] = useState<Array<{ key: string; value: string; params?: string[] }>>(
		contact?.custom_fields && contact.custom_fields.length > 0 ? contact.custom_fields : []
	)
	const [orgUnitsInput, setOrgUnitsInput] = useState(contact?.org_units?.join(', ') || '')
	const [categoriesInput, setCategoriesInput] = useState(contact?.categories?.join(', ') || '')
	const [fullName, setFullName] = useState(
		contact?.full_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() || ''
	)
	const existingPhotoUrl = contact?.id ? getContactPhotoUrl(contact) : null
	const [showAdvanced, setShowAdvanced] = useState(false)
	const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
	const [photoData, setPhotoData] = useState<string | null>(null)
	const [photoMime, setPhotoMime] = useState<string | null>(null)
	const [photoWidth, setPhotoWidth] = useState<number | null>(null)
	const [photoHeight, setPhotoHeight] = useState<number | null>(null)
	const [photoRemove, setPhotoRemove] = useState(false)
	const [showExistingPhoto, setShowExistingPhoto] = useState(true)
	const [cropSource, setCropSource] = useState<string | null>(null)
	const [isCropOpen, setIsCropOpen] = useState(false)
	const [crop, setCrop] = useState({ x: 0, y: 0 })
	const [zoom, setZoom] = useState(1)
	const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null)
	const [cropOutputMime, setCropOutputMime] = useState('image/jpeg')
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [validationErrors, setValidationErrors] = useState<Record<string, Record<number, string | null>>>({})
	const isInitialMount = useRef(true)

	// Calculate full_name from first_name and last_name only when user edits them
	useEffect(() => {
		// Skip recalculation on initial mount to preserve custom full_name
		if (isInitialMount.current) {
			isInitialMount.current = false
			return
		}

		// Recalculate full_name when user edits first_name or last_name
		const parts = [formData.first_name, formData.last_name].filter(Boolean)
		setFullName(parts.join(' ').trim() || '')
	}, [formData.first_name, formData.last_name])

	// Validate emails
	const validateEmails = (emailFields: ContactField[]): boolean => {
		const errors: Record<number, string | null> = {}
		let isValid = true

		emailFields.forEach((field, index) => {
			if (field.value.trim()) {
				const error = validateEmail(field.value)
				if (error) {
					errors[index] = error
					isValid = false
				} else {
					errors[index] = null
				}
			} else {
				errors[index] = null
			}
		})

		setValidationErrors(prev => ({ ...prev, emails: errors }))
		return isValid
	}

	// Validate URLs
	const validateUrls = (urlFields: ContactField[]): boolean => {
		const errors: Record<number, string | null> = {}
		let isValid = true

		urlFields.forEach((field, index) => {
			if (field.value.trim()) {
				const error = validateUrl(field.value)
				if (error) {
					errors[index] = error
					isValid = false
				} else {
					errors[index] = null
				}
			} else {
				errors[index] = null
			}
		})

		setValidationErrors(prev => ({ ...prev, urls: errors }))
		return isValid
	}

	// Handle email changes with validation
	const handleEmailsChange = (newEmails: ContactField[]) => {
		setEmails(newEmails)
		// Validate after a short delay to avoid showing errors while typing
		setTimeout(() => validateEmails(newEmails), 300)
	}

	// Handle URL changes with validation and normalization
	const handleUrlsChange = (newUrls: ContactField[]) => {
		// Normalize URLs (add protocol if missing)
		const normalized = newUrls.map(url => ({
			...url,
			value: url.value.trim() ? normalizeUrl(url.value) : url.value,
		}))
		setUrls(normalized)
		// Validate after a short delay
		setTimeout(() => validateUrls(normalized), 300)
	}

	const handlePhotoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return
		const dataUrl = await readFileAsDataUrl(file)
		setCropSource(dataUrl)
		setCropOutputMime(file.type === 'image/png' ? 'image/png' : 'image/jpeg')
		setCrop({ x: 0, y: 0 })
		setZoom(1)
		setCroppedAreaPixels(null)
		setIsCropOpen(true)
	}

	const handleCropSave = async () => {
		if (!cropSource || !croppedAreaPixels) return
		const { dataUrl, width, height } = await cropToSquareDataUrl({
			imageSrc: cropSource,
			crop: croppedAreaPixels,
			outputSize: 512,
			outputMime: cropOutputMime,
			quality: cropOutputMime === 'image/jpeg' ? 0.9 : undefined,
		})
		const base64Data = dataUrl.split(',')[1] || ''
		setPhotoPreviewUrl(dataUrl)
		setPhotoData(base64Data)
		setPhotoMime(cropOutputMime)
		setPhotoWidth(width)
		setPhotoHeight(height)
		setPhotoRemove(false)
		setShowExistingPhoto(false)
		setIsCropOpen(false)
		setCropSource(null)
	}

	const handleCropCancel = () => {
		setIsCropOpen(false)
		setCropSource(null)
	}

	const handleRemovePhoto = () => {
		setPhotoPreviewUrl(null)
		setPhotoData(null)
		setPhotoMime(null)
		setPhotoWidth(null)
		setPhotoHeight(null)
		setPhotoRemove(true)
		setShowExistingPhoto(false)
	}

	const addCustomField = () => {
		setCustomFields([...customFields, { key: '', value: '' }])
	}

	const updateCustomField = (index: number, updates: Partial<{ key: string; value: string; params?: string[] }>) => {
		const next = [...customFields]
		next[index] = { ...next[index], ...updates }
		setCustomFields(next)
	}

	const removeCustomField = (index: number) => {
		setCustomFields(customFields.filter((_, i) => i !== index))
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		// Validate all fields before submission
		const emailsValid = validateEmails(emails)
		const urlsValid = validateUrls(urls)

		if (!emailsValid || !urlsValid) {
			// Scroll to first error
			const firstErrorField = document.querySelector('.border-red-500')
			if (firstErrorField) {
				firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' })
			}
			return
		}

		setIsSubmitting(true)
		try {
			const parseListInput = (value: string): string[] =>
				value
					.split(',')
					.map(entry => entry.trim())
					.filter(Boolean)

			// Normalize URLs before submission
			const normalizedUrls = urls.map(url => ({
				...url,
				value: url.value.trim() ? normalizeUrl(url.value) : url.value,
			}))

			const normalizedPhones = phones.map(phone => ({
				...phone,
				value: normalizePhoneNumber(phone.value) ?? '',
			}))

			// Filter out empty fields before submission
			const nonEmptyPhones = normalizedPhones.filter(p => p.value.trim())
			const nonEmptyEmails = emails.filter(e => e.value.trim())
			const nonEmptyAddresses = addresses.filter(a => a.value.trim())
			const nonEmptyUrls = normalizedUrls.filter(u => u.value.trim())
			const nonEmptyLabels = labels.filter(label => label.value.trim())
			const nonEmptyLogos = logos.filter(logo => logo.value.trim())
			const nonEmptySounds = sounds.filter(sound => sound.value.trim())
			const nonEmptyKeys = keys.filter(key => key.value.trim())
			const nonEmptyCustomFields = customFields.filter(field => field.key.trim() && field.value.trim())
			const orgUnits = parseListInput(orgUnitsInput)
			const categories = parseListInput(categoriesInput)

			// Extract structured address fields from the first address (primary address)
			let structuredAddressFields: Partial<Contact> = {}
			if (nonEmptyAddresses.length > 0) {
				const primaryAddress = nonEmptyAddresses[0]!.value
				const parsed = parseAddress(primaryAddress)
				structuredAddressFields = {
					address_street: parsed.street || null,
					address_city: parsed.city || null,
					address_state: parsed.state || null,
					address_postal: parsed.postal || null,
					address_country: parsed.country || null,
				}
			}

			const photoPayload: ContactPayload = {}
			if (photoRemove) {
				photoPayload.photo_remove = true
			} else if (photoData && photoMime) {
				photoPayload.photo_data = photoData
				photoPayload.photo_mime = photoMime ?? undefined
				photoPayload.photo_width = photoWidth || 512
				photoPayload.photo_height = photoHeight || 512
			}

			await onSubmit({
				...formData,
				full_name: fullName || null,
				birthday: formData.birthday ? new Date(formData.birthday) : null,
				phones: nonEmptyPhones.length > 0 ? nonEmptyPhones : null,
				emails: nonEmptyEmails.length > 0 ? nonEmptyEmails : null,
				addresses: nonEmptyAddresses.length > 0 ? nonEmptyAddresses : null,
				urls: nonEmptyUrls.length > 0 ? nonEmptyUrls : null,
				labels: nonEmptyLabels.length > 0 ? nonEmptyLabels : null,
				logos: nonEmptyLogos.length > 0 ? nonEmptyLogos : null,
				sounds: nonEmptySounds.length > 0 ? nonEmptySounds : null,
				keys: nonEmptyKeys.length > 0 ? nonEmptyKeys : null,
				org_units: orgUnits.length > 0 ? orgUnits : null,
				categories: categories.length > 0 ? categories : null,
				custom_fields: nonEmptyCustomFields.length > 0 ? nonEmptyCustomFields : null,
				// Backward compatibility: set single values from arrays
				phone: nonEmptyPhones.length > 0 ? nonEmptyPhones[0].value : null,
				email: nonEmptyEmails.length > 0 ? nonEmptyEmails[0].value : null,
				address: nonEmptyAddresses.length > 0 ? nonEmptyAddresses[0].value : null,
				homepage: nonEmptyUrls.length > 0 ? nonEmptyUrls[0].value : null,
				// Structured address fields for easier querying and display
				...structuredAddressFields,
				...photoPayload,
			})
		} finally {
			setIsSubmitting(false)
		}
	}

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
	const hasLabels = labels.some(label => label.value.trim())
	const hasLogos = logos.some(logo => logo.value.trim())
	const hasSounds = sounds.some(sound => sound.value.trim())
	const hasKeys = keys.some(key => key.value.trim())
	const hasCustomFields = customFields.some(field => field.key.trim() || field.value.trim())

	const shouldShowAdvancedField = (hasValue: boolean) => showAdvanced || hasValue

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="flex items-center gap-4">
				<div className="h-20 w-20 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
					{photoPreviewUrl ? (
						<img src={photoPreviewUrl} alt="Contact" className="h-full w-full object-cover" />
					) : showExistingPhoto && existingPhotoUrl ? (
						<img src={existingPhotoUrl} alt="Contact" className="h-full w-full object-cover" onError={() => setShowExistingPhoto(false)} />
					) : (
						<span className="text-xs text-gray-400">No Photo</span>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<Input type="file" accept="image/*" onChange={handlePhotoFileChange} />
					{(photoPreviewUrl || (showExistingPhoto && existingPhotoUrl)) && (
						<Button type="button" variant="outline" onClick={handleRemovePhoto}>
							Remove photo
						</Button>
					)}
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4">
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

			<div className="grid grid-cols-2 gap-4">
				<Field>
					<FieldLabel htmlFor="full_name">Full Name</FieldLabel>
					<FieldContent>
						<Input id="full_name" value={fullName} readOnly disabled className="bg-gray-50 cursor-not-allowed" required />
					</FieldContent>
				</Field>
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
			</div>

			<div>
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
			</div>

			<div>
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
			</div>

			<div className="grid grid-cols-2 gap-4">
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

			<div>
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
			</div>

			<div>
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
			</div>

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

			<div className="flex items-center justify-between">
				<span className="text-sm text-muted-foreground">Advanced fields</span>
				<Button
					type="button"
					variant={showAdvanced ? 'default' : 'outline'}
					size="sm"
					aria-pressed={showAdvanced}
					onClick={() => setShowAdvanced(prev => !prev)}
				>
					{showAdvanced ? 'Hide advanced fields' : 'Show advanced fields'}
				</Button>
			</div>

			{(shouldShowAdvancedField(hasNamePrefix) ||
				shouldShowAdvancedField(hasNameSuffix) ||
				shouldShowAdvancedField(hasMiddleName) ||
				shouldShowAdvancedField(hasMaidenName)) && (
				<div className="grid grid-cols-2 gap-4">
					{shouldShowAdvancedField(hasNamePrefix) && (
						<Field>
							<FieldLabel htmlFor="name_prefix">Name Prefix</FieldLabel>
							<FieldContent>
								<Input
									id="name_prefix"
									name="name_prefix"
									autoComplete="honorific-prefix"
									value={formData.name_prefix}
									onChange={e => setFormData({ ...formData, name_prefix: e.target.value })}
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
									onChange={e => setFormData({ ...formData, name_suffix: e.target.value })}
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
									onChange={e => setFormData({ ...formData, middle_name: e.target.value })}
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
									onChange={e => setFormData({ ...formData, maiden_name: e.target.value })}
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
				<div className="grid grid-cols-2 gap-4">
					{shouldShowAdvancedField(hasRole) && (
						<Field>
							<FieldLabel htmlFor="role">Role</FieldLabel>
							<FieldContent>
								<Input id="role" name="role" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} />
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
									onChange={e => setFormData({ ...formData, mailer: e.target.value })}
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
									onChange={e => setFormData({ ...formData, time_zone: e.target.value })}
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
									onChange={e => setFormData({ ...formData, geo: e.target.value })}
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
				<div className="grid grid-cols-2 gap-4">
					{shouldShowAdvancedField(hasAgent) && (
						<Field>
							<FieldLabel htmlFor="agent">Agent</FieldLabel>
							<FieldContent>
								<Input id="agent" name="agent" value={formData.agent} onChange={e => setFormData({ ...formData, agent: e.target.value })} />
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
									onChange={e => setFormData({ ...formData, prod_id: e.target.value })}
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
									onChange={e => setFormData({ ...formData, revision: e.target.value })}
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
									onChange={e => setFormData({ ...formData, sort_string: e.target.value })}
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
									onChange={e => setFormData({ ...formData, class: e.target.value })}
									placeholder="PUBLIC, PRIVATE, or CONFIDENTIAL"
								/>
							</FieldContent>
						</Field>
					)}
				</div>
			)}

			{(shouldShowAdvancedField(hasOrgUnits) || shouldShowAdvancedField(hasCategories)) && (
				<div className="grid grid-cols-2 gap-4">
					{shouldShowAdvancedField(hasOrgUnits) && (
						<Field>
							<FieldLabel htmlFor="org_units">Organization Units</FieldLabel>
							<FieldContent>
								<Input
									id="org_units"
									name="org_units"
									value={orgUnitsInput}
									onChange={e => setOrgUnitsInput(e.target.value)}
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
									onChange={e => setCategoriesInput(e.target.value)}
									placeholder="Friends, Work, VIP"
								/>
							</FieldContent>
						</Field>
					)}
				</div>
			)}

			{shouldShowAdvancedField(hasLabels) && (
				<MultiFieldInput
					label="Labels"
					fields={labels}
					onChange={setLabels}
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
					onChange={setLogos}
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
					onChange={setSounds}
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
					onChange={setKeys}
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

			<div className="flex gap-2 justify-end">
				{onCancel && (
					<Button type="button" variant="outline" onClick={onCancel}>
						Cancel
					</Button>
				)}
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : contact ? 'Update' : 'Create'}
				</Button>
			</div>

			<Dialog open={isCropOpen} onOpenChange={open => !open && handleCropCancel()}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Crop Photo</DialogTitle>
					</DialogHeader>
					<div className="relative h-80 w-full bg-black/80">
						{cropSource && (
							<Cropper
								image={cropSource}
								crop={crop}
								zoom={zoom}
								aspect={1}
								onCropChange={setCrop}
								onZoomChange={setZoom}
								onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
							/>
						)}
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm text-gray-500">Zoom</span>
						<input
							type="range"
							min={1}
							max={3}
							step={0.1}
							value={zoom}
							onChange={event => setZoom(Number(event.target.value))}
							className="flex-1"
						/>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleCropCancel}>
							Cancel
						</Button>
						<Button type="button" onClick={handleCropSave}>
							Use photo
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</form>
	)
}

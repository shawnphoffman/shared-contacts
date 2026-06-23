import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizeUrl, validateEmail, validateUrl } from '../../lib/validation'
import { normalizePhoneNumber } from '../../lib/utils'
import { cropToSquareDataUrl, getContactPhotoUrl, readFileAsDataUrl } from '../../lib/image'
import { parseAddress } from '../AddressInput'
import type { CropArea } from '../../lib/image'
import type { AddressBook, Contact, ContactField } from '../../lib/db'

export type ContactPayload = Partial<Contact> & {
	photo_data?: string
	photo_mime?: string | null
	photo_width?: number | null
	photo_height?: number | null
	photo_remove?: boolean
	address_book_ids?: Array<string>
}

type CustomField = { key: string; value: string; params?: Array<string> }

// Format birthday for the date input (YYYY-MM-DD). Birthday is stored as a
// date-only string; just take its date part. A Date fallback (read in UTC)
// guards against any legacy callers still passing a Date.
function formatDateForInput(date: string | Date | null | undefined): string {
	if (!date) return ''
	if (typeof date === 'string') return date.slice(0, 10)
	const year = date.getUTCFullYear()
	const month = String(date.getUTCMonth() + 1).padStart(2, '0')
	const day = String(date.getUTCDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

// Initialize arrays from contact, or migrate from single values.
// Always return at least one empty field so users don't need to click "+".
function initializeArray(
	array: Array<ContactField> | null | undefined,
	singleValue: string | null | undefined,
	defaultType: string
): Array<ContactField> {
	if (array && array.length > 0) {
		return array
	}
	if (singleValue) {
		return [{ value: singleValue, type: defaultType }]
	}
	return [{ value: '', type: defaultType }]
}

function initializeOptionalArray(array: Array<ContactField> | null | undefined): Array<ContactField> {
	if (array && array.length > 0) {
		return array
	}
	return []
}

interface BuildPayloadOptions {
	/** Include address-book membership in the payload. Screens with no
	 * book-membership UI should leave this false so memberships are untouched. */
	includeAddressBooks?: boolean
}

/**
 * Owns all contact form state, handlers, validation, and payload building.
 * Shared by the create (`/new`) and edit (`/$id`) screens, which both drive the
 * two-column ContactEditPane + ContactPreview so a live preview can read the
 * same in-progress values the form edits.
 */
export function useContactForm(contact?: Contact) {
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

	const [phones, setPhones] = useState<Array<ContactField>>(initializeArray(contact?.phones, contact?.phone, 'CELL'))
	const [emails, setEmails] = useState<Array<ContactField>>(initializeArray(contact?.emails, contact?.email, 'INTERNET'))
	const [addresses, setAddresses] = useState<Array<ContactField>>(initializeArray(contact?.addresses, contact?.address, 'HOME'))
	const [urls, setUrls] = useState<Array<ContactField>>(initializeArray(contact?.urls, contact?.homepage, 'HOME'))
	const [labels, setLabels] = useState<Array<ContactField>>(initializeOptionalArray(contact?.labels))
	const [logos, setLogos] = useState<Array<ContactField>>(initializeOptionalArray(contact?.logos))
	const [sounds, setSounds] = useState<Array<ContactField>>(initializeOptionalArray(contact?.sounds))
	const [keys, setKeys] = useState<Array<ContactField>>(initializeOptionalArray(contact?.keys))
	const [customFields, setCustomFields] = useState<Array<CustomField>>(
		contact?.custom_fields && contact.custom_fields.length > 0 ? contact.custom_fields : []
	)
	const [orgUnitsInput, setOrgUnitsInput] = useState(contact?.org_units?.join(', ') || '')
	const [categoriesInput, setCategoriesInput] = useState(contact?.categories?.join(', ') || '')
	const [fullName, setFullName] = useState(
		contact?.full_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() || ''
	)
	const existingPhotoUrl = contact?.id ? getContactPhotoUrl(contact) : null

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
	const [validationErrors, setValidationErrors] = useState<Partial<Record<string, Record<number, string | null>>>>({})
	const isInitialMount = useRef(true)

	const [addressBooks, setAddressBooks] = useState<Array<AddressBook>>([])
	const [selectedBookIds, setSelectedBookIds] = useState<Array<string>>([])
	// Baseline membership, captured once books load, so toggling a book registers
	// as an unsaved change without the async load itself looking dirty.
	const initialBookIds = useRef<Array<string> | null>(null)

	useEffect(() => {
		let isMounted = true
		const loadAddressBooks = async () => {
			try {
				const response = await fetch('/api/address-books')
				if (!response.ok) return
				const books = (await response.json()) as Array<AddressBook>
				if (!isMounted) return
				setAddressBooks(books)
				if (initialBookIds.current === null) {
					const existing = contact?.address_books?.map(book => book.id) || []
					const baseline = existing.length > 0 ? existing : books.filter(book => book.is_public).map(book => book.id)
					initialBookIds.current = baseline
					setSelectedBookIds(baseline)
				}
			} catch (error) {
				console.error('Failed to load address books', error)
			}
		}
		loadAddressBooks()
		return () => {
			isMounted = false
		}
	}, [contact?.id])

	// Calculate full_name from first_name and last_name only when user edits them
	useEffect(() => {
		// Skip recalculation on initial mount to preserve custom full_name
		if (isInitialMount.current) {
			isInitialMount.current = false
			return
		}
		const parts = [formData.first_name, formData.last_name].filter(Boolean)
		setFullName(parts.join(' ').trim() || '')
	}, [formData.first_name, formData.last_name])

	const validateEmails = (emailFields: Array<ContactField>): boolean => {
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

	const validateUrls = (urlFields: Array<ContactField>): boolean => {
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

	const handleEmailsChange = (newEmails: Array<ContactField>) => {
		setEmails(newEmails)
		setTimeout(() => validateEmails(newEmails), 300)
	}

	const handleUrlsChange = (newUrls: Array<ContactField>) => {
		const normalized = newUrls.map(url => ({
			...url,
			value: url.value.trim() ? normalizeUrl(url.value) : url.value,
		}))
		setUrls(normalized)
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
		// Allow re-selecting the same file later
		event.target.value = ''
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

	const parseListInput = (value: string): Array<string> =>
		value
			.split(',')
			.map(entry => entry.trim())
			.filter(Boolean)

	/** Validate the whole form. Returns true when it is safe to submit. */
	const validateAll = (): boolean => {
		const emailsValid = validateEmails(emails)
		const urlsValid = validateUrls(urls)
		return emailsValid && urlsValid
	}

	/** Build the API payload from the current form state. */
	const buildPayload = (options: BuildPayloadOptions = {}): ContactPayload => {
		const normalizedUrls = urls.map(url => ({
			...url,
			value: url.value.trim() ? normalizeUrl(url.value) : url.value,
		}))
		const normalizedPhones = phones.map(phone => ({
			...phone,
			value: normalizePhoneNumber(phone.value) ?? '',
		}))

		const nonEmptyPhones = normalizedPhones.filter(p => p.value.trim())
		const nonEmptyEmails = emails.filter(emailField => emailField.value.trim())
		const nonEmptyAddresses = addresses.filter(a => a.value.trim())
		const nonEmptyUrls = normalizedUrls.filter(u => u.value.trim())
		const nonEmptyLabels = labels.filter(label => label.value.trim())
		const nonEmptyLogos = logos.filter(logo => logo.value.trim())
		const nonEmptySounds = sounds.filter(sound => sound.value.trim())
		const nonEmptyKeys = keys.filter(key => key.value.trim())
		const nonEmptyCustomFields = customFields.filter(field => field.key.trim() && field.value.trim())
		const orgUnits = parseListInput(orgUnitsInput)
		const categories = parseListInput(categoriesInput)

		// Extract structured address fields from the first (primary) address.
		let structuredAddressFields: Partial<Contact> = {}
		if (nonEmptyAddresses.length > 0) {
			const parsed = parseAddress(nonEmptyAddresses[0].value)
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
			photoPayload.photo_mime = photoMime
			photoPayload.photo_width = photoWidth || 512
			photoPayload.photo_height = photoHeight || 512
		}

		return {
			...formData,
			full_name: fullName || null,
			birthday: formData.birthday || null,
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
			...structuredAddressFields,
			...photoPayload,
			...(options.includeAddressBooks ? { address_book_ids: selectedBookIds } : {}),
		}
	}

	// Snapshot of the saved state, used to derive the unsaved-changes indicator.
	// Photo edits are tracked separately since their payload is volatile.
	const initialSnapshot = useMemo(() => JSON.stringify(buildPayload()), [contact?.id])

	const currentSnapshot = JSON.stringify(buildPayload())
	const photoDirty = Boolean(photoData) || photoRemove
	const booksDirty =
		initialBookIds.current !== null && [...selectedBookIds].sort().join(',') !== [...initialBookIds.current].sort().join(',')
	const isDirty = currentSnapshot !== initialSnapshot || photoDirty || booksDirty

	return {
		// scalar fields
		formData,
		setFormData,
		fullName,
		// multi-value groups
		phones,
		setPhones,
		emails,
		setEmails,
		addresses,
		setAddresses,
		urls,
		setUrls,
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
		// validation
		validationErrors,
		handleEmailsChange,
		handleUrlsChange,
		validateAll,
		// photo
		existingPhotoUrl,
		photoPreviewUrl,
		showExistingPhoto,
		setShowExistingPhoto,
		photoRemove,
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
		// address books
		addressBooks,
		selectedBookIds,
		setSelectedBookIds,
		// submission
		isSubmitting,
		setIsSubmitting,
		isDirty,
		buildPayload,
	}
}

export type UseContactForm = ReturnType<typeof useContactForm>

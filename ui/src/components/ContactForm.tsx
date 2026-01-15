import { useState, useEffect, useRef } from 'react'
import Cropper from 'react-easy-crop'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Field, FieldContent, FieldLabel } from './ui/field'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { PhoneInput } from './PhoneInput'
import { MultiFieldInput } from './MultiFieldInput'
import { AddressInput, parseAddress } from './AddressInput'
import { validateEmail, validateUrl, normalizeUrl } from '../lib/validation'
import {
  cropToSquareDataUrl,
  getContactPhotoUrl,
  readFileAsDataUrl,
  type CropArea,
} from '../lib/image'
import type { Contact, ContactField } from '../lib/db'

export type ContactPayload = Partial<Contact> & {
  photo_data?: string
  photo_mime?: string
  photo_width?: number
  photo_height?: number
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
    defaultType: string,
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

  const [formData, setFormData] = useState({
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    nickname: contact?.nickname || '',
    organization: contact?.organization || '',
    job_title: contact?.job_title || '',
    notes: contact?.notes || '',
    birthday: formatDateForInput(contact?.birthday),
  })

  const [phones, setPhones] = useState<ContactField[]>(
    initializeArray(contact?.phones, contact?.phone, 'CELL'),
  )
  const [emails, setEmails] = useState<ContactField[]>(
    initializeArray(contact?.emails, contact?.email, 'INTERNET'),
  )
  const [addresses, setAddresses] = useState<ContactField[]>(
    initializeArray(contact?.addresses, contact?.address, 'HOME'),
  )
  const [urls, setUrls] = useState<ContactField[]>(
    initializeArray(contact?.urls, contact?.homepage, 'HOME'),
  )
  const [fullName, setFullName] = useState(
    contact?.full_name ||
      [contact?.first_name, contact?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      '',
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
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(
    null,
  )
  const [cropOutputMime, setCropOutputMime] = useState('image/jpeg')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState<
    Record<string, Record<number, string | null>>
  >({})
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

    setValidationErrors((prev) => ({ ...prev, emails: errors }))
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

    setValidationErrors((prev) => ({ ...prev, urls: errors }))
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
    const normalized = newUrls.map((url) => ({
      ...url,
      value: url.value.trim() ? normalizeUrl(url.value) : url.value,
    }))
    setUrls(normalized)
    // Validate after a short delay
    setTimeout(() => validateUrls(normalized), 300)
  }

  const handlePhotoFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
      // Normalize URLs before submission
      const normalizedUrls = urls.map((url) => ({
        ...url,
        value: url.value.trim() ? normalizeUrl(url.value) : url.value,
      }))

      // Filter out empty fields before submission
      const nonEmptyPhones = phones.filter((p) => p.value.trim())
      const nonEmptyEmails = emails.filter((e) => e.value.trim())
      const nonEmptyAddresses = addresses.filter((a) => a.value.trim())
      const nonEmptyUrls = normalizedUrls.filter((u) => u.value.trim())

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
        photoPayload.photo_mime = photoMime
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
          {photoPreviewUrl ? (
            <img
              src={photoPreviewUrl}
              alt="Contact"
              className="h-full w-full object-cover"
            />
          ) : showExistingPhoto && existingPhotoUrl ? (
            <img
              src={existingPhotoUrl}
              alt="Contact"
              className="h-full w-full object-cover"
              onError={() => setShowExistingPhoto(false)}
            />
          ) : (
            <span className="text-xs text-gray-400">No Photo</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Input
            type="file"
            accept="image/*"
            onChange={handlePhotoFileChange}
          />
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
              onChange={(e) =>
                setFormData({ ...formData, first_name: e.target.value })
              }
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
              onChange={(e) =>
                setFormData({ ...formData, last_name: e.target.value })
              }
            />
          </FieldContent>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="full_name">Full Name</FieldLabel>
          <FieldContent>
            <Input
              id="full_name"
              value={fullName}
              readOnly
              disabled
              className="bg-gray-50 cursor-not-allowed"
              required
            />
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
              onChange={(e) =>
                setFormData({ ...formData, nickname: e.target.value })
              }
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
                onChange={(e) => onChange(e.target.value)}
                placeholder="Enter email address"
                className={
                  validationErrors.emails?.[index] ? 'border-red-500' : ''
                }
              />
              {validationErrors.emails?.[index] && (
                <p className="text-sm text-red-500 mt-1">
                  {validationErrors.emails[index]}
                </p>
              )}
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
              onChange={(e) =>
                setFormData({ ...formData, organization: e.target.value })
              }
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
              onChange={(e) =>
                setFormData({ ...formData, job_title: e.target.value })
              }
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
              <AddressInput
                value={field.value}
                onChange={onChange}
              />
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
                onChange={(e) => onChange(e.target.value)}
                placeholder="example.com or https://example.com"
                className={
                  validationErrors.urls?.[index] ? 'border-red-500' : ''
                }
              />
              {validationErrors.urls?.[index] && (
                <p className="text-sm text-red-500 mt-1">
                  {validationErrors.urls[index]}
                </p>
              )}
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
            onChange={(e) =>
              setFormData({ ...formData, birthday: e.target.value })
            }
          />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="notes">Notes</FieldLabel>
        <FieldContent>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            rows={4}
          />
        </FieldContent>
      </Field>

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

      <Dialog open={isCropOpen} onOpenChange={(open) => !open && handleCropCancel()}>
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
              onChange={(event) => setZoom(Number(event.target.value))}
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

import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Field, FieldContent, FieldLabel } from './ui/field'
import { PhoneInput } from './PhoneInput'
import { MultiFieldInput } from './MultiFieldInput'
import { AddressInput } from './AddressInput'
import { validateEmail, validateUrl, normalizeUrl } from '../lib/validation'
import type { Contact, ContactField } from '../lib/db'

interface ContactFormProps {
  contact?: Contact
  onSubmit: (data: Partial<Contact>) => Promise<void>
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
    return []
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

      await onSubmit({
        ...formData,
        full_name: fullName || null,
        birthday: formData.birthday ? new Date(formData.birthday) : null,
        phones: phones.length > 0 ? phones : null,
        emails: emails.length > 0 ? emails : null,
        addresses: addresses.length > 0 ? addresses : null,
        urls: normalizedUrls.length > 0 ? normalizedUrls : null,
        // Backward compatibility: set single values from arrays
        phone: phones.length > 0 ? phones[0].value : null,
        email: emails.length > 0 ? emails[0].value : null,
        address: addresses.length > 0 ? addresses[0].value : null,
        homepage: normalizedUrls.length > 0 ? normalizedUrls[0].value : null,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="first_name">First Name</FieldLabel>
          <FieldContent>
            <Input
              id="first_name"
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
          renderInput={(field, _index, onChange) => (
            <PhoneInput
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
          renderInput={(field, index, onChange) => (
            <div className="flex-1">
              <AddressInput
                value={field.value}
                onChange={onChange}
                placeholder="Enter address"
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
            type="date"
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
    </form>
  )
}

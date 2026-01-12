import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Field, FieldContent, FieldLabel } from './ui/field'
import { PhoneInput } from './PhoneInput'
import { MultiFieldInput } from './MultiFieldInput'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await onSubmit({
        ...formData,
        full_name: fullName || null,
        birthday: formData.birthday ? new Date(formData.birthday) : null,
        phones: phones.length > 0 ? phones : null,
        emails: emails.length > 0 ? emails : null,
        addresses: addresses.length > 0 ? addresses : null,
        urls: urls.length > 0 ? urls : null,
        // Backward compatibility: set single values from arrays
        phone: phones.length > 0 ? phones[0].value : null,
        email: emails.length > 0 ? emails[0].value : null,
        address: addresses.length > 0 ? addresses[0].value : null,
        homepage: urls.length > 0 ? urls[0].value : null,
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
          onChange={setEmails}
          placeholder="Enter email address"
          inputType="email"
          defaultType="INTERNET"
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
        />
      </div>

      <div>
        <MultiFieldInput
          label="URLs / Websites"
          fields={urls}
          onChange={setUrls}
          placeholder="https://example.com"
          inputType="url"
          defaultType="HOME"
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

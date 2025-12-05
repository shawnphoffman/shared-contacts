import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import type { Contact } from '../lib/db'

interface ContactFormProps {
  contact?: Contact
  onSubmit: (data: Partial<Contact>) => Promise<void>
  onCancel?: () => void
}

export function ContactForm({ contact, onSubmit, onCancel }: ContactFormProps) {
  const [formData, setFormData] = useState({
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    nickname: contact?.nickname || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    organization: contact?.organization || '',
    job_title: contact?.job_title || '',
    address: contact?.address || '',
    notes: contact?.notes || '',
  })
  const [fullName, setFullName] = useState(
    contact?.full_name ||
    [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() ||
    ''
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Calculate full_name from first_name and last_name
  useEffect(() => {
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
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="first_name">First Name</Label>
          <Input
            id="first_name"
            value={formData.first_name}
            onChange={(e) =>
              setFormData({ ...formData, first_name: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="last_name">Last Name</Label>
          <Input
            id="last_name"
            value={formData.last_name}
            onChange={(e) =>
              setFormData({ ...formData, last_name: e.target.value })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="full_name">Full Name</Label>
          <Input
            id="full_name"
            value={fullName}
            readOnly
            disabled
            className="bg-gray-50 cursor-not-allowed"
            required
          />
        </div>
        <div>
          <Label htmlFor="nickname">Nickname</Label>
          <Input
            id="nickname"
            value={formData.nickname}
            onChange={(e) =>
              setFormData({ ...formData, nickname: e.target.value })
            }
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) =>
              setFormData({ ...formData, phone: e.target.value })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="organization">Organization</Label>
          <Input
            id="organization"
            value={formData.organization}
            onChange={(e) =>
              setFormData({ ...formData, organization: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="job_title">Job Title</Label>
          <Input
            id="job_title"
            value={formData.job_title}
            onChange={(e) =>
              setFormData({ ...formData, job_title: e.target.value })
            }
          />
        </div>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) =>
            setFormData({ ...formData, address: e.target.value })
          }
        />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) =>
            setFormData({ ...formData, notes: e.target.value })
          }
          rows={4}
        />
      </div>

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


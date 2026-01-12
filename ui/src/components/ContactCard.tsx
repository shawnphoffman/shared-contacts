import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Mail, Phone, Building, MapPin } from 'lucide-react'
import type { Contact } from '../lib/db'
import { formatPhoneNumber } from '../lib/utils'

interface ContactCardProps {
  contact: Contact
}

export function ContactCard({ contact }: ContactCardProps) {
  return (
    <Link to="/$id" params={{ id: contact.id }}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader>
          <CardTitle className="text-xl">
            {contact.full_name || 'Unnamed Contact'}
            {contact.nickname && (
              <span className="text-base font-normal text-gray-500 ml-2">
                ({contact.nickname})
              </span>
            )}
          </CardTitle>
          {contact.job_title && contact.organization && (
            <p className="text-sm text-gray-500">
              {contact.job_title} at {contact.organization}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {contact.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-gray-400" />
              <span>{contact.email}</span>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-gray-400" />
              <span>{formatPhoneNumber(contact.phone)}</span>
            </div>
          )}
          {contact.organization && !contact.job_title && (
            <div className="flex items-center gap-2 text-sm">
              <Building className="w-4 h-4 text-gray-400" />
              <span>{contact.organization}</span>
            </div>
          )}
          {contact.address && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="truncate">{contact.address}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

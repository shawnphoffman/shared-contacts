import { Contact } from '~/lib/db';
import { Link } from '@tanstack/react-router';

interface ContactListProps {
  contacts: Contact[];
}

export function ContactList({ contacts }: ContactListProps) {
  if (contacts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No contacts found.</p>
        <a
          href="/contacts/new"
          className="text-blue-600 hover:text-blue-800"
        >
          Add your first contact
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {contacts.map((contact) => (
        <Link
          key={contact.id}
          to="/contacts/$id"
          params={{ id: contact.id }}
          className="bg-white rounded-lg shadow p-6 hover:shadow-md transition"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {contact.full_name || 'Unnamed Contact'}
          </h3>
          {contact.email && (
            <p className="text-sm text-gray-600 mb-1">{contact.email}</p>
          )}
          {contact.phone && (
            <p className="text-sm text-gray-600 mb-1">{contact.phone}</p>
          )}
          {contact.organization && (
            <p className="text-sm text-gray-500">{contact.organization}</p>
          )}
        </Link>
      ))}
    </div>
  );
}


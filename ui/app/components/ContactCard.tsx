import { Contact } from '~/lib/db';

interface ContactCardProps {
  contact: Contact;
}

export function ContactCard({ contact }: ContactCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        {contact.full_name || 'Unnamed Contact'}
      </h2>

      <div className="space-y-4">
        {contact.email && (
          <div>
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p className="text-lg text-gray-900">
              <a href={`mailto:${contact.email}`} className="text-blue-600 hover:text-blue-800">
                {contact.email}
              </a>
            </p>
          </div>
        )}

        {contact.phone && (
          <div>
            <label className="text-sm font-medium text-gray-500">Phone</label>
            <p className="text-lg text-gray-900">
              <a href={`tel:${contact.phone}`} className="text-blue-600 hover:text-blue-800">
                {contact.phone}
              </a>
            </p>
          </div>
        )}

        {contact.organization && (
          <div>
            <label className="text-sm font-medium text-gray-500">Organization</label>
            <p className="text-lg text-gray-900">{contact.organization}</p>
          </div>
        )}

        {contact.job_title && (
          <div>
            <label className="text-sm font-medium text-gray-500">Job Title</label>
            <p className="text-lg text-gray-900">{contact.job_title}</p>
          </div>
        )}

        {contact.address && (
          <div>
            <label className="text-sm font-medium text-gray-500">Address</label>
            <p className="text-lg text-gray-900 whitespace-pre-line">{contact.address}</p>
          </div>
        )}

        {contact.notes && (
          <div>
            <label className="text-sm font-medium text-gray-500">Notes</label>
            <p className="text-lg text-gray-900 whitespace-pre-line">{contact.notes}</p>
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t">
        <a
          href={`/contacts/${contact.id}/edit`}
          className="text-blue-600 hover:text-blue-800 mr-4"
        >
          Edit
        </a>
        <a
          href="/contacts"
          onClick={async (e) => {
            e.preventDefault();
            if (confirm('Are you sure you want to delete this contact?')) {
              await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
              window.location.href = '/contacts';
            }
          }}
          className="text-red-600 hover:text-red-800"
        >
          Delete
        </a>
      </div>
    </div>
  );
}


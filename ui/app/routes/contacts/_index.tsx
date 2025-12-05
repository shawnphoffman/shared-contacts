import { createFileRoute } from '@tanstack/react-router';
import { ContactList } from '~/components/ContactList';
import { getAllContacts } from '~/lib/db';

export const Route = createFileRoute('/contacts/')({
  component: ContactsComponent,
  loader: async () => {
    const contacts = await getAllContacts();
    return { contacts };
  },
});

function ContactsComponent() {
  const { contacts } = Route.useLoaderData();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
        <a
          href="/contacts/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Add Contact
        </a>
      </div>
      <ContactList contacts={contacts} />
    </div>
  );
}


import { createFileRoute } from '@tanstack/react-router';
import { ContactCard } from '~/components/ContactCard';
import { getContactById } from '~/lib/db';

export const Route = createFileRoute('/contacts/$id')({
  component: ContactDetailComponent,
  loader: async ({ params }) => {
    const contact = await getContactById(params.id);
    if (!contact) {
      throw new Error('Contact not found');
    }
    return { contact };
  },
});

function ContactDetailComponent() {
  const { contact } = Route.useLoaderData();

  return (
    <div>
      <a
        href="/contacts"
        className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
      >
        ← Back to Contacts
      </a>
      <ContactCard contact={contact} />
    </div>
  );
}


import { createFileRoute } from '@tanstack/react-router';
import { ContactForm } from '~/components/ContactForm';
import { getContactById } from '~/lib/db';

export const Route = createFileRoute('/contacts/$id/edit')({
  component: EditContactComponent,
  loader: async ({ params }) => {
    const contact = await getContactById(params.id);
    if (!contact) {
      throw new Error('Contact not found');
    }
    return { contact };
  },
});

function EditContactComponent() {
  const { contact } = Route.useLoaderData();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Contact</h1>
      <ContactForm contact={contact} />
    </div>
  );
}


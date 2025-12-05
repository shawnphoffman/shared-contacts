import { createFileRoute } from '@tanstack/react-router';
import { ContactForm } from '~/components/ContactForm';

export const Route = createFileRoute('/contacts/new')({
  component: NewContactComponent,
});

function NewContactComponent() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Add New Contact</h1>
      <ContactForm />
    </div>
  );
}


import { createAPIFileRoute } from '@tanstack/start/api';
import { createContact, getAllContacts } from '~/lib/db';
import { generateVCard, extractUID } from '~/lib/vcard';

export const Route = createAPIFileRoute('/api/contacts')({
  GET: async () => {
    const contacts = await getAllContacts();
    return Response.json(contacts);
  },
  POST: async ({ request }) => {
    const data = await request.json();
    const vcardData = generateVCard({}, data);
    const vcardId = extractUID(vcardData);
    const contact = await createContact({
      ...data,
      vcard_id: vcardId,
      vcard_data: vcardData,
    });
    return Response.json(contact);
  },
});


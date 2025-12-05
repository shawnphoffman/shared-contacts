import { createAPIFileRoute } from '@tanstack/start/api';
import { getContactById, updateContact, deleteContact } from '~/lib/db';
import { generateVCard, extractUID } from '~/lib/vcard';

export const Route = createAPIFileRoute('/api/contacts/$id')({
  GET: async ({ params }) => {
    const contact = await getContactById(params.id);
    if (!contact) {
      return Response.json({ error: 'Contact not found' }, { status: 404 });
    }
    return Response.json(contact);
  },
  PUT: async ({ params, request }) => {
    const data = await request.json();
    const existingContact = await getContactById(params.id);
    const vcardData = generateVCard({ uid: existingContact?.vcard_id || undefined }, data);
    const vcardId = extractUID(vcardData) || existingContact?.vcard_id;
    const contact = await updateContact(params.id, {
      ...data,
      vcard_id: vcardId,
      vcard_data: vcardData,
    });
    return Response.json(contact);
  },
  DELETE: async ({ params }) => {
    await deleteContact(params.id);
    return Response.json({ success: true });
  },
});


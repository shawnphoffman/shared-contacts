import { createAPIFileRoute } from '@tanstack/start/api';
import { auth } from '~/lib/auth';

export const Route = createAPIFileRoute('/api/auth/$')({
  GET: async ({ request }) => {
    return auth.handler(request);
  },
  POST: async ({ request }) => {
    return auth.handler(request);
  },
  PUT: async ({ request }) => {
    return auth.handler(request);
  },
  DELETE: async ({ request }) => {
    return auth.handler(request);
  },
});


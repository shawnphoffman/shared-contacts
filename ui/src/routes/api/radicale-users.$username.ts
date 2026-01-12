import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || 'http://sync-service:3001'

async function proxyRequest(path: string, options?: RequestInit) {
  const url = `${SYNC_SERVICE_URL}${path}`
  const response = await fetch(url, options)
  const data = await response.json()
  return { data, status: response.status }
}

export const Route = createFileRoute('/api/radicale-users/$username')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try {
          const { username } = params
          const body = await request.json()
          const { data, status } = await proxyRequest(
            `/api/radicale-users/${encodeURIComponent(username)}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          )
          return json(data, { status })
        } catch (error: any) {
          console.error('Error updating Radicale user:', error)
          return json({ error: 'Failed to update user' }, { status: 500 })
        }
      },
      DELETE: async ({ params }) => {
        try {
          const { username } = params
          const { data, status } = await proxyRequest(
            `/api/radicale-users/${encodeURIComponent(username)}`,
            { method: 'DELETE' }
          )
          return json(data, { status })
        } catch (error: any) {
          console.error('Error deleting Radicale user:', error)
          return json({ error: 'Failed to delete user' }, { status: 500 })
        }
      },
    },
  },
})

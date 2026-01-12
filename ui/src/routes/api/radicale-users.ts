import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || 'http://sync-service:3001'

async function proxyRequest(path: string, options?: RequestInit) {
  const url = `${SYNC_SERVICE_URL}${path}`
  const response = await fetch(url, options)
  const data = await response.json()
  return { data, status: response.status }
}

export const Route = createFileRoute('/api/radicale-users')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { data, status } = await proxyRequest('/api/radicale-users')
          return json(data, { status })
        } catch (error: any) {
          console.error('Error fetching Radicale users:', error)
          return json({ error: 'Failed to fetch users' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { data, status } = await proxyRequest('/api/radicale-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          return json(data, { status })
        } catch (error: any) {
          console.error('Error creating Radicale user:', error)
          return json({ error: 'Failed to create user' }, { status: 500 })
        }
      },
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { verifyUsersFile } from '../../lib/htpasswd'

export const Route = createFileRoute('/api/radicale-users/verify')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await verifyUsersFile()
          return json(result)
        } catch (error: any) {
          console.error('Error verifying users file:', error)
          return json(
            {
              accessible: false,
              readable: false,
              writable: false,
              valid: false,
              userCount: 0,
              error: error.message || 'Unknown error',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})

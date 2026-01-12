import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getUsers,
  createUser,
  ValidationError,
  FileSystemError,
  UserExistsError,
} from '../../lib/htpasswd'

export const Route = createFileRoute('/api/radicale-users')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const users = await getUsers()
          return json(users)
        } catch (error: any) {
          console.error('Error fetching Radicale users:', error)
          if (error instanceof FileSystemError) {
            return json({ error: error.message }, { status: 500 })
          }
          return json({ error: 'Failed to fetch users' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { username, password } = body

          if (!username || !password) {
            return json(
              { error: 'Username and password are required' },
              { status: 400 },
            )
          }

          await createUser(username, password)
          return json({ username }, { status: 201 })
        } catch (error: any) {
          console.error('Error creating Radicale user:', error)
          if (error instanceof ValidationError) {
            return json({ error: error.message }, { status: 400 })
          }
          if (error instanceof UserExistsError) {
            return json({ error: error.message }, { status: 409 })
          }
          if (error instanceof FileSystemError) {
            return json({ error: error.message }, { status: 500 })
          }
          return json({ error: 'Failed to create user' }, { status: 500 })
        }
      },
    },
  },
})

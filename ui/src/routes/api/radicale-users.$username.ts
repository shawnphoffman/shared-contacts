import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  updateUserPassword,
  deleteUser,
  ValidationError,
  FileSystemError,
  UserNotFoundError,
} from '../../lib/htpasswd'

export const Route = createFileRoute('/api/radicale-users/$username')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try {
          const { username } = params
          const body = await request.json()
          const { password } = body

          if (!password) {
            return json({ error: 'Password is required' }, { status: 400 })
          }

          await updateUserPassword(username, password)
          return json({ username })
        } catch (error: any) {
          console.error('Error updating Radicale user:', error)
          if (error instanceof ValidationError) {
            return json({ error: error.message }, { status: 400 })
          }
          if (error instanceof UserNotFoundError) {
            return json({ error: error.message }, { status: 404 })
          }
          if (error instanceof FileSystemError) {
            return json({ error: error.message }, { status: 500 })
          }
          return json({ error: 'Failed to update user' }, { status: 500 })
        }
      },
      DELETE: async ({ params }) => {
        try {
          const { username } = params
          await deleteUser(username)
          return json({ success: true })
        } catch (error: any) {
          console.error('Error deleting Radicale user:', error)
          if (error instanceof ValidationError) {
            return json({ error: error.message }, { status: 400 })
          }
          if (error instanceof UserNotFoundError) {
            return json({ error: error.message }, { status: 404 })
          }
          if (error instanceof FileSystemError) {
            return json({ error: error.message }, { status: 500 })
          }
          return json({ error: 'Failed to delete user' }, { status: 500 })
        }
      },
    },
  },
})

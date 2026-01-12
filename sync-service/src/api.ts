import express, { Request, Response } from 'express'
import cors from 'cors'
import {
  getUsers,
  createUser,
  updateUserPassword,
  deleteUser,
} from './htpasswd'

const app = express()
const PORT = process.env.API_PORT || 3001

app.use(cors())
app.use(express.json())

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

// Get all Radicale users
app.get('/api/radicale-users', async (_req: Request, res: Response) => {
  try {
    const users = await getUsers()
    res.json(users)
  } catch (error: any) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Create a new Radicale user
app.post('/api/radicale-users', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    if (username.includes(':') || username.includes('\n')) {
      return res.status(400).json({ error: 'Username contains invalid characters' })
    }

    await createUser(username, password)
    res.status(201).json({ username })
  } catch (error: any) {
    console.error('Error creating user:', error)
    if (error.message?.includes('already exists')) {
      return res.status(409).json({ error: error.message })
    }
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Update a user's password
app.put('/api/radicale-users/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ error: 'Password is required' })
    }

    await updateUserPassword(username, password)
    res.json({ username })
  } catch (error: any) {
    console.error('Error updating user:', error)
    if (error.message?.includes('does not exist')) {
      return res.status(404).json({ error: error.message })
    }
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Delete a user
app.delete('/api/radicale-users/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params
    await deleteUser(username)
    res.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting user:', error)
    if (error.message?.includes('does not exist')) {
      return res.status(404).json({ error: error.message })
    }
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export function startApiServer() {
  app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`)
  })
}

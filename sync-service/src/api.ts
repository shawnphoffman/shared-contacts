import express, { Request, Response } from 'express'
import cors from 'cors'
import { getUsers, createUser, updateUserPassword, deleteUser, backfillSharedContactsForUser } from './htpasswd'

const app = express()
const PORT = 3001

// Track when migrations are complete and whether startup hit a fatal error
let migrationsComplete = false
let startupError: Error | null = null

export function setMigrationsComplete() {
	migrationsComplete = true
}

export function setStartupError(error: unknown) {
	if (error instanceof Error) {
		startupError = error
	} else {
		startupError = new Error(String(error))
	}
}

app.use(cors())
app.use(express.json())

// Health check (always returns ok once server is running)
app.get('/health', (_req: Request, res: Response) => {
	res.json({ status: 'ok' })
})

// Readiness check:
// - returns 500 if a fatal startup error occurred
// - returns 200 only after migrations complete
// - otherwise 503 while still starting up
app.get('/ready', (_req: Request, res: Response) => {
	if (startupError) {
		return res.status(500).json({
			status: 'error',
			message: startupError.message || 'Sync service startup error',
		})
	}

	if (migrationsComplete) {
		return res.json({ status: 'ready', migrations: 'complete' })
	}

	return res.status(503).json({ status: 'not ready', migrations: 'pending' })
})

// Get all Radicale users
app.get('/api/radicale-users', async (req: Request, res: Response) => {
	try {
		const includeComposite = req.query.include_composite === 'true'
		const allUsers = await getUsers()

		// Filter out composite users unless explicitly requested
		// Composite users are auto-managed and shouldn't appear in the UI
		const { isCompositeUsername } = await import('./htpasswd')
		const users = includeComposite ? allUsers : allUsers.filter(user => !isCompositeUsername(user.username))

		res.json(users)
	} catch (error: unknown) {
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
	} catch (error: unknown) {
		console.error('Error creating user:', error)
		if (error instanceof Error && error.message.includes('already exists')) {
			return res.status(409).json({ error: error.message })
		}
		res.status(500).json({ error: 'Failed to create user' })
	}
})

// Backfill shared contacts for a user
app.post('/api/radicale-users/backfill/:username', async (req: Request, res: Response) => {
	try {
		const { username } = req.params
		console.log('backfilling user', username)
		await backfillSharedContactsForUser(username)
		res.json({ success: true })
	} catch (error: unknown) {
		console.error('Error backfilling shared contacts:', error)
		res.status(500).json({ error: 'Failed to backfill shared contacts' })
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
	} catch (error: unknown) {
		console.error('Error updating user:', error)
		if (error instanceof Error && error.message.includes('does not exist')) {
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
	} catch (error: unknown) {
		console.error('Error deleting user:', error)
		if (error instanceof Error && error.message.includes('does not exist')) {
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

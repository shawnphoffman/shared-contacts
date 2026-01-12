import bcrypt from 'bcrypt'
import {
  readFile,
  writeFile,
  access,
  rename,
  unlink,
  open,
  constants,
} from 'fs/promises'

const USERS_FILE = process.env.RADICALE_USERS_FILE || '/radicale-data/users'
const LOCK_FILE = `${USERS_FILE}.lock`
const TEMP_FILE = `${USERS_FILE}.tmp`

export interface RadicaleUser {
  username: string
}

// Custom error types for better error handling
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class FileSystemError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'FileSystemError'
  }
}

export class UserExistsError extends Error {
  constructor(username: string) {
    super(`User ${username} already exists`)
    this.name = 'UserExistsError'
  }
}

export class UserNotFoundError extends Error {
  constructor(username: string) {
    super(`User ${username} does not exist`)
    this.name = 'UserNotFoundError'
  }
}

// Mutex for file locking
let lockPromise: Promise<void> | null = null
const lockQueue: Array<{
  resolve: () => void
  reject: (error: Error) => void
}> = []

/**
 * Acquire a file lock using a mutex pattern
 * This prevents concurrent writes to the users file
 */
async function acquireLock(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    lockQueue.push({ resolve, reject })

    // If this is the first in queue, start processing
    if (lockQueue.length === 1) {
      processLockQueue()
    }
  })
}

async function processLockQueue(): Promise<void> {
  while (lockQueue.length > 0) {
    const { resolve } = lockQueue[0]

    // Try to acquire file lock
    try {
      // Use fs.open with exclusive flag for advisory locking
      const fd = await open(LOCK_FILE, 'wx')
      await fd.close()

      // Lock acquired, resolve and wait for release
      const release = () => {
        unlink(LOCK_FILE).catch(() => {
          // Ignore errors when removing lock file
        })
        lockQueue.shift()
        if (lockQueue.length > 0) {
          processLockQueue()
        }
      }

      resolve(release)
      // Wait for release to be called (handled by caller)
      break
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // Lock file exists, wait a bit and retry
        await new Promise((r) => setTimeout(r, 50))
        continue
      }
      // Other error, reject and move on
      lockQueue.shift()?.reject(
        new FileSystemError(
          `Failed to acquire lock: ${error.message}`,
          error.code,
        ),
      )
    }
  }
}

/**
 * Validate username format
 * Usernames should be alphanumeric with allowed special characters
 */
function validateUsername(username: string): void {
  if (!username || typeof username !== 'string') {
    throw new ValidationError('Username is required')
  }

  if (username.length < 1) {
    throw new ValidationError('Username cannot be empty')
  }

  if (username.length > 255) {
    throw new ValidationError('Username cannot exceed 255 characters')
  }

  // Username cannot contain : or newline (htpasswd format requirement)
  if (username.includes(':') || username.includes('\n') || username.includes('\r')) {
    throw new ValidationError(
      'Username cannot contain colons, newlines, or carriage returns',
    )
  }

  // Username should be alphanumeric with allowed characters (_, -, .)
  // This is a reasonable restriction for htpasswd compatibility
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    throw new ValidationError(
      'Username can only contain letters, numbers, underscores, hyphens, and dots',
    )
  }
}

/**
 * Validate password
 */
function validatePassword(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required')
  }

  if (password.length < 1) {
    throw new ValidationError('Password cannot be empty')
  }

  // Optional: Add password strength requirements
  // For now, just ensure it's not empty
  if (password.length > 4096) {
    throw new ValidationError('Password cannot exceed 4096 characters')
  }
}

/**
 * Read users file content safely
 */
async function readUsersFile(): Promise<string> {
  try {
    await access(USERS_FILE, constants.F_OK | constants.R_OK)
    return await readFile(USERS_FILE, 'utf-8')
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, return empty string
      return ''
    }
    throw new FileSystemError(
      `Failed to read users file: ${error.message}`,
      error.code,
    )
  }
}

/**
 * Write content to users file atomically
 * Uses a temporary file and atomic rename to prevent corruption
 */
async function writeUsersFile(content: string): Promise<void> {
  const release = await acquireLock()

  try {
    // Write to temporary file first
    await writeFile(TEMP_FILE, content, 'utf-8')

    // Atomically rename temp file to users file
    // This is atomic on most filesystems and prevents corruption
    await rename(TEMP_FILE, USERS_FILE)
  } catch (error: any) {
    // Clean up temp file if it exists
    try {
      await unlink(TEMP_FILE)
    } catch {
      // Ignore cleanup errors
    }

    throw new FileSystemError(
      `Failed to write users file: ${error.message}`,
      error.code,
    )
  } finally {
    // Always release the lock
    release()
  }
}

/**
 * Parse users from htpasswd file content
 */
function parseUsers(content: string): RadicaleUser[] {
  const users: RadicaleUser[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [username] = trimmed.split(':')
      if (username) {
        users.push({ username })
      }
    }
  }

  return users
}

/**
 * Read all users from the htpasswd file
 */
export async function getUsers(): Promise<RadicaleUser[]> {
  try {
    const content = await readUsersFile()
    return parseUsers(content)
  } catch (error: any) {
    if (error instanceof FileSystemError) {
      throw error
    }
    throw new FileSystemError(
      `Failed to get users: ${error.message}`,
      error.code,
    )
  }
}

/**
 * Check if a user exists
 */
export async function userExists(username: string): Promise<boolean> {
  validateUsername(username)
  const users = await getUsers()
  return users.some((u) => u.username === username)
}

/**
 * Create a new user with a password
 */
export async function createUser(
  username: string,
  password: string,
): Promise<void> {
  validateUsername(username)
  validatePassword(password)

  const release = await acquireLock()

  try {
    // Check if user exists (within lock to prevent race condition)
    const users = await getUsers()
    if (users.some((u) => u.username === username)) {
      throw new UserExistsError(username)
    }

    // Hash password with bcrypt (10 rounds is standard)
    const hash = await bcrypt.hash(password, 10)

    // Read existing content
    const content = await readUsersFile()

    // Append new user (format: username:hashed_password)
    const newLine = `${username}:${hash}\n`
    const newContent =
      content + (content && !content.endsWith('\n') ? '\n' : '') + newLine

    // Write atomically
    await writeUsersFile(newContent)
  } finally {
    release()
  }
}

/**
 * Update a user's password
 */
export async function updateUserPassword(
  username: string,
  password: string,
): Promise<void> {
  validateUsername(username)
  validatePassword(password)

  const release = await acquireLock()

  try {
    // Read existing content
    const content = await readUsersFile()
    const users = parseUsers(content)

    // Check if user exists
    if (!users.some((u) => u.username === username)) {
      throw new UserNotFoundError(username)
    }

    // Hash password with bcrypt
    const hash = await bcrypt.hash(password, 10)

    // Replace the user's line
    const lines = content.split('\n')
    let found = false
    const updatedLines = lines.map((line) => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [lineUsername] = trimmed.split(':')
        if (lineUsername === username) {
          found = true
          return `${username}:${hash}`
        }
      }
      return line
    })

    if (!found) {
      throw new UserNotFoundError(username)
    }

    // Write atomically
    await writeUsersFile(updatedLines.join('\n') + '\n')
  } finally {
    release()
  }
}

/**
 * Delete a user
 */
export async function deleteUser(username: string): Promise<void> {
  validateUsername(username)

  const release = await acquireLock()

  try {
    // Read existing content
    const content = await readUsersFile()
    const users = parseUsers(content)

    // Check if user exists
    if (!users.some((u) => u.username === username)) {
      throw new UserNotFoundError(username)
    }

    // Remove the user's line
    const lines = content.split('\n')
    const filteredLines = lines.filter((line) => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [lineUsername] = trimmed.split(':')
        return lineUsername !== username
      }
      return true
    })

    // Write atomically
    await writeUsersFile(filteredLines.join('\n') + '\n')
  } finally {
    release()
  }
}

/**
 * Verify the users file is accessible and has valid format
 */
export async function verifyUsersFile(): Promise<{
  accessible: boolean
  readable: boolean
  writable: boolean
  valid: boolean
  userCount: number
  error?: string
}> {
  try {
    // Check if file exists and is accessible
    await access(USERS_FILE, constants.F_OK)

    // Check if readable
    await access(USERS_FILE, constants.R_OK)

    // Check if writable (by attempting to open for write)
    try {
      const fd = await open(USERS_FILE, 'r+')
      await fd.close()
    } catch {
      // If we can't open for write, it's not writable
      return {
        accessible: true,
        readable: true,
        writable: false,
        valid: false,
        userCount: 0,
        error: 'File is not writable',
      }
    }

    // Try to parse the file
    const content = await readUsersFile()
    const users = parseUsers(content)

    return {
      accessible: true,
      readable: true,
      writable: true,
      valid: true,
      userCount: users.length,
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        accessible: false,
        readable: false,
        writable: false,
        valid: false,
        userCount: 0,
        error: 'File does not exist',
      }
    }

    return {
      accessible: false,
      readable: false,
      writable: false,
      valid: false,
      userCount: 0,
      error: error.message || 'Unknown error',
    }
  }
}

import bcrypt from 'bcrypt'
import path from 'path'
import { readFile, writeFile, access, constants, readdir, copyFile, mkdir } from 'fs/promises'

const USERS_FILE = process.env.RADICALE_USERS_FILE || '/radicale-data/users'
const RADICALE_STORAGE_PATH = process.env.RADICALE_STORAGE_PATH || '/radicale-data/collections'
const SHARED_COLLECTION_NAME = 'shared-contacts'

function getSharedAddressBookPathForUser(username: string): string {
  return path.join(RADICALE_STORAGE_PATH, 'collection-root', username, SHARED_COLLECTION_NAME)
}

function getSharedAddressBookPath(): string {
  return path.join(RADICALE_STORAGE_PATH, 'collection-root', SHARED_COLLECTION_NAME)
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

async function ensureSharedProps(userPath: string): Promise<void> {
  const propsPath = path.join(userPath, '.Radicale.props')
  try {
    await access(propsPath, constants.F_OK)
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error
    }
    const props = {
      tag: 'VADDRESSBOOK',
      'D:displayname': 'Shared Contacts',
      'C:addressbook-description': 'Shared contacts for all users',
    }
    await writeFile(propsPath, JSON.stringify(props), 'utf-8')
  }
}

export async function backfillSharedContactsForUser(username: string): Promise<void> {
  const userPath = getSharedAddressBookPathForUser(username)
  await ensureDirectoryExists(userPath)
  await ensureSharedProps(userPath)

  const masterPath = getSharedAddressBookPath()
  try {
    await access(masterPath, constants.F_OK)
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return
    }
    throw error
  }

  const masterFiles = await readdir(masterPath)
  for (const file of masterFiles) {
    if (!file.endsWith('.vcf') && !file.endsWith('.ics')) {
      continue
    }
    const sourcePath = path.join(masterPath, file)
    const destinationPath = path.join(userPath, file)
    try {
      await access(destinationPath, constants.F_OK)
      continue
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    await copyFile(sourcePath, destinationPath)
  }
}

export interface RadicaleUser {
  username: string
}

/**
 * Read all users from the htpasswd file
 */
export async function getUsers(): Promise<RadicaleUser[]> {
  try {
    await access(USERS_FILE, constants.F_OK)

    const content = await readFile(USERS_FILE, 'utf-8')
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
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

/**
 * Check if a user exists
 */
export async function userExists(username: string): Promise<boolean> {
  const users = await getUsers()
  return users.some(u => u.username === username)
}

/**
 * Create a new user with a password
 */
export async function createUser(username: string, password: string): Promise<void> {
  if (await userExists(username)) {
    throw new Error(`User ${username} already exists`)
  }

  // Hash password with bcrypt (10 rounds is standard)
  const hash = await bcrypt.hash(password, 10)

  // Read existing users
  let content = ''
  try {
    await access(USERS_FILE, constants.F_OK)
    content = await readFile(USERS_FILE, 'utf-8')
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  // Append new user (format: username:hashed_password)
  const newLine = `${username}:${hash}\n`
  const newContent = content + (content && !content.endsWith('\n') ? '\n' : '') + newLine

  await writeFile(USERS_FILE, newContent, 'utf-8')
  await backfillSharedContactsForUser(username)
}

/**
 * Update a user's password
 */
export async function updateUserPassword(username: string, password: string): Promise<void> {
  if (!(await userExists(username))) {
    throw new Error(`User ${username} does not exist`)
  }

  // Hash password with bcrypt
  const hash = await bcrypt.hash(password, 10)

  // Read existing users
  let content = ''
  try {
    await access(USERS_FILE, constants.F_OK)
    content = await readFile(USERS_FILE, 'utf-8')
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  // Replace the user's line
  const lines = content.split('\n')
  const updatedLines = lines.map(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [lineUsername] = trimmed.split(':')
      if (lineUsername === username) {
        return `${username}:${hash}`
      }
    }
    return line
  })

  await writeFile(USERS_FILE, updatedLines.join('\n') + '\n', 'utf-8')
}

/**
 * Delete a user
 */
export async function deleteUser(username: string): Promise<void> {
  if (!(await userExists(username))) {
    throw new Error(`User ${username} does not exist`)
  }

  // Read existing users
  let content = ''
  try {
    await access(USERS_FILE, constants.F_OK)
    content = await readFile(USERS_FILE, 'utf-8')
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  // Remove the user's line
  const lines = content.split('\n')
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [lineUsername] = trimmed.split(':')
      return lineUsername !== username
    }
    return true
  })

  await writeFile(USERS_FILE, filteredLines.join('\n') + '\n', 'utf-8')
}

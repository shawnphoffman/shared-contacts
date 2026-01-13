import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Copy, Check, Server, User, Lock, Link as LinkIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { Separator } from '../components/ui/separator'

export const Route = createFileRoute('/carddav-connection')({
  component: CardDAVConnectionPage,
})

interface RadicaleUser {
  username: string
}

async function fetchUsers(): Promise<RadicaleUser[]> {
  const response = await fetch('/api/radicale-users')
  if (!response.ok) {
    throw new Error('Failed to fetch users')
  }
  return response.json()
}

function getCardDAVBaseUrl(): string {
  // In production, this should come from an environment variable
  // For now, we'll construct it from the current location
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    const currentPort = window.location.port

    // For local development (localhost or 127.0.0.1), use direct Radicale port
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0'

    if (isLocalhost) {
      // Local development - Radicale runs on port 5232
      return `${protocol}//${hostname}:5232`
    }

    // Production: Check if we're behind a reverse proxy
    // If on standard ports (80/443) or same port as UI, assume reverse proxy
    const isStandardPort =
      !currentPort || currentPort === '80' || currentPort === '443'
    const isUIPort = currentPort === '3030'

    if (isStandardPort || isUIPort) {
      // Likely behind reverse proxy - CardDAV might be at /carddav path
      const port = currentPort && !isStandardPort ? `:${currentPort}` : ''
      return `${protocol}//${hostname}${port}/carddav`
    } else {
      // Direct connection - use Radicale port
      return `${protocol}//${hostname}:5232`
    }
  }
  // Fallback for SSR
  return 'http://localhost:5232'
}

function getCardDAVUrl(username: string): string {
  const baseUrl = getCardDAVBaseUrl()
  // Radicale uses the username as the collection path
  // The shared contacts are typically at /shared/contacts
  return `${baseUrl}/${username}/shared/contacts/`
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="ml-2"
      title={`Copy ${label}`}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 mr-1" />
          Copied
        </>
      ) : (
        <>
          <Copy className="w-4 h-4 mr-1" />
          Copy
        </>
      )}
    </Button>
  )
}

function CardDAVConnectionPage() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['radicale-users'],
    queryFn: fetchUsers,
  })

  const baseUrl = getCardDAVBaseUrl()

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading connection details...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">CardDAV Connection</h1>
        <p className="text-gray-600">
          Configure your CardDAV client to sync contacts with this server.
        </p>
      </div>

      {/* Server Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            <CardTitle>Server Information</CardTitle>
          </div>
          <CardDescription>
            Use these details to configure your CardDAV client
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <LinkIcon className="w-4 h-4 text-gray-500" />
              <label className="text-sm font-medium">Server URL:</label>
            </div>
            <div className="flex items-center">
              <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm break-all">
                {baseUrl}
              </code>
              <CopyButton text={baseUrl} label="Server URL" />
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-gray-500" />
              <label className="text-sm font-medium">Authentication:</label>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Use the username and password configured in the{' '}
              <a
                href="/radicale-users"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                CardDAV Users
              </a>{' '}
              page. These credentials are separate from your web UI login.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-gray-500" />
              <label className="text-sm font-medium">Security:</label>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              For production use, ensure you're using HTTPS. If your server is
              behind a reverse proxy (like Traefik or Nginx), configure SSL/TLS
              at the proxy level.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* User Connection Details */}
      {users.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Connection Details by User</CardTitle>
            <CardDescription>
              Subscription URLs for each CardDAV user account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Subscription URL</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const subscriptionUrl = getCardDAVUrl(user.username)
                    return (
                      <TableRow key={user.username}>
                        <TableCell className="font-medium">
                          {user.username}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs break-all">
                            {subscriptionUrl}
                          </code>
                        </TableCell>
                        <TableCell>
                          <CopyButton
                            text={subscriptionUrl}
                            label="Subscription URL"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No CardDAV Users</CardTitle>
            <CardDescription>
              Create a CardDAV user to enable contact synchronization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              You need to create at least one CardDAV user before you can sync
              contacts. CardDAV users are managed separately from web UI
              accounts.
            </p>
            <Button asChild>
              <a href="/radicale-users">Go to CardDAV Users</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Client Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Client Configuration Instructions</CardTitle>
          <CardDescription>
            Step-by-step guides for popular CardDAV clients
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* iOS Contacts */}
          <div>
            <h3 className="font-semibold mb-2">iOS Contacts</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>Open Settings → Contacts → Accounts</li>
              <li>Tap "Add Account" → "Other"</li>
              <li>Tap "Add CardDAV Account"</li>
              <li>
                Enter:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>
                    <strong>Server:</strong>{' '}
                    {baseUrl.replace(/^https?:\/\//, '')}
                  </li>
                  <li>
                    <strong>Username:</strong> Your CardDAV username
                  </li>
                  <li>
                    <strong>Password:</strong> Your CardDAV password
                  </li>
                </ul>
              </li>
              <li>Tap "Next" and wait for verification</li>
              <li>Enable "Contacts" and tap "Save"</li>
            </ol>
          </div>

          <Separator />

          {/* Android (DAVx⁵) */}
          <div>
            <h3 className="font-semibold mb-2">Android (DAVx⁵)</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>Install DAVx⁵ from Google Play Store</li>
              <li>Open DAVx⁵ and tap "Login"</li>
              <li>Select "Login with URL and user name"</li>
              <li>
                Enter:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>
                    <strong>Base URL:</strong> {baseUrl}
                  </li>
                  <li>
                    <strong>User name:</strong> Your CardDAV username
                  </li>
                  <li>
                    <strong>Password:</strong> Your CardDAV password
                  </li>
                </ul>
              </li>
              <li>Tap "Login" and grant permissions</li>
              <li>Enable contact sync in Android settings</li>
            </ol>
          </div>

          <Separator />

          {/* Thunderbird */}
          <div>
            <h3 className="font-semibold mb-2">Thunderbird</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>Install the "CardBook" add-on</li>
              <li>Open CardBook → File → New → CardDAV Address Book</li>
              <li>
                Enter:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>
                    <strong>Name:</strong> Shared Contacts
                  </li>
                  <li>
                    <strong>URL:</strong> {baseUrl}
                  </li>
                  <li>
                    <strong>User name:</strong> Your CardDAV username
                  </li>
                  <li>
                    <strong>Password:</strong> Your CardDAV password
                  </li>
                </ul>
              </li>
              <li>Click "Verify" and then "OK"</li>
            </ol>
          </div>

          <Separator />

          {/* macOS Contacts */}
          <div>
            <h3 className="font-semibold mb-2">macOS Contacts</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>Open Contacts app</li>
              <li>Go to Contacts → Settings → Accounts</li>
              <li>Click "+" → "Other Contacts Account"</li>
              <li>Select "CardDAV" as account type</li>
              <li>
                Enter:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>
                    <strong>Server URL:</strong> {baseUrl}
                  </li>
                  <li>
                    <strong>User name:</strong> Your CardDAV username
                  </li>
                  <li>
                    <strong>Password:</strong> Your CardDAV password
                  </li>
                </ul>
              </li>
              <li>Click "Sign In"</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>
            <strong>Connection fails:</strong> Verify the server URL is correct
            and accessible from your network. If behind a firewall, ensure port
            5232 (or your configured port) is open.
          </p>
          <p>
            <strong>Authentication fails:</strong> Double-check your username
            and password. CardDAV credentials are separate from web UI
            credentials.
          </p>
          <p>
            <strong>HTTPS required:</strong> Some clients require HTTPS. If
            using HTTP, ensure your client allows insecure connections, or set
            up a reverse proxy with SSL/TLS.
          </p>
          <p>
            <strong>No contacts appear:</strong> Make sure contacts exist in the
            web UI. The sync service automatically synchronizes contacts between
            the database and CardDAV.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

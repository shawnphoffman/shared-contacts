import { createFileRoute } from '@tanstack/react-router'
import { HelpCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export const Route = createFileRoute('/help')({
	component: HelpPage,
})

function HelpPage() {
	return (
		<div className="container mx-auto p-6 space-y-6 max-w-3xl">
			<div className="mb-6">
				<h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
					<HelpCircle className="w-8 h-8" />
					Help
				</h1>
				<p className="text-muted-foreground">Understanding how contacts, address books, and users work together.</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Contacts</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<p>
						Contacts are individual records stored in the database. Each contact can include a name, email addresses, phone numbers,
						birthday, organization, and other standard contact fields.
					</p>
					<p>
						A contact is not tied to a single address book. It can exist in zero, one, or multiple address books simultaneously. This means
						the same contact can appear across different collections without being duplicated in the database.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Address Books</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<p>Address books are collections that organize contacts into groups. They control which contacts are synced to which users.</p>
					<ul className="list-disc list-inside space-y-1 ml-1">
						<li>
							<strong>Public books</strong> are visible to all users and their contacts are synced to every user's CardDAV client
							automatically.
						</li>
						<li>
							<strong>Private books</strong> are only visible to users that have been explicitly assigned to them.
						</li>
					</ul>
					<p>
						You can also enable a <strong>read-only subscription</strong> on a book, which generates a special URL that allows external
						clients to subscribe without being able to modify contacts.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Users (Radicale Users)</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<p>
						Users are CardDAV sync accounts managed by Radicale. They are separate from the web UI and are used exclusively for syncing
						contacts to devices via CardDAV-compatible clients such as Apple Contacts, DAVx5, or Thunderbird CardBook.
					</p>
					<p>
						Each user is assigned to one or more address books. When a user syncs, they receive all contacts from the books they are
						assigned to, plus all contacts from any public books.
					</p>
					<p>
						Each user-book combination creates a <strong>composite username</strong> (e.g.,{' '}
						<code className="text-xs bg-muted px-1 py-0.5 rounded">username-bookid</code>) that is used when configuring a CardDAV client.
						You can find the exact connection details on the Address Books page by clicking the Connection button for a book.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>How They Relate</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<p>The three concepts form a layered system:</p>
					<ol className="list-decimal list-inside space-y-1 ml-1">
						<li>
							<strong>Contacts</strong> live in the database as standalone records.
						</li>
						<li>
							<strong>Address books</strong> organize contacts into named collections that can be public or private.
						</li>
						<li>
							<strong>Users</strong> sync contacts to their devices via CardDAV based on which books they are assigned to.
						</li>
					</ol>
					<p>
						When a contact belongs to multiple address books, it will appear in each assigned user's synced collection for those books. For
						example, if "Jane Doe" is in both the "Family" and "Work" books, a user assigned to both books will see "Jane Doe" in each of
						their synced address book collections.
					</p>
				</CardContent>
			</Card>
		</div>
	)
}

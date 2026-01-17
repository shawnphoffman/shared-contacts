import { createFileRoute } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import { CSVUpload } from '../components/CSVUpload'

export const Route = createFileRoute('/import')({
	component: ImportPage,
})

function ImportPage() {
	return (
		<div className="container mx-auto p-6 max-w-2xl">
			<div className="mb-6">
				<h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
					<Upload className="w-8 h-8" />
					Import Contacts
				</h1>
				<p className="text-muted-foreground">Upload a CSV file to import contacts into your address book.</p>
			</div>
			<div className="bg-card border rounded-lg p-6">
				<CSVUpload />
			</div>
		</div>
	)
}

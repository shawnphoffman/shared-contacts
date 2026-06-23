import { createFileRoute } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import { PageContainer } from '../components/ui/page-container'
import { PageHeader } from '../components/ui/page-header'
import { CSVUpload } from '../components/CSVUpload'

export const Route = createFileRoute('/import')({
	component: ImportPage,
})

function ImportPage() {
	return (
		<PageContainer width="narrow" className="space-y-6">
			<PageHeader icon={<Upload />} title="Import" description="Bring contacts in from a CSV file." />
			<CSVUpload />
		</PageContainer>
	)
}

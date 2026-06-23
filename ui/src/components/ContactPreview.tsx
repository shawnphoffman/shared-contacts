import { useState } from 'react'
import { Cake, Mail, MoreHorizontal, Phone, Trash2 } from 'lucide-react'
import { formatPhoneNumber } from '../lib/utils'
import { formatAddressForDisplay, parseAddress } from './AddressInput'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import type { Contact } from '../lib/db'
import type { UseContactForm } from './contact-form/useContactForm'

/**
 * Format a date-only birthday string ("YYYY-MM-DD") for display without
 * timezone shifts. Years at or below 1700 (e.g. Apple's 1604 placeholder)
 * are treated as "no year given" and omitted.
 */
function formatBirthday(value: string): string | null {
	const trimmed = value.trim()
	if (!trimmed) return null
	const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
	if (!match) return trimmed
	const year = Number(match[1])
	const date = new Date(year, Number(match[2]) - 1, Number(match[3]))
	if (Number.isNaN(date.getTime())) return trimmed
	const hasYear = year > 1700
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		...(hasYear ? { year: 'numeric' } : {}),
	})
}

function getAge(value: string): number | null {
	const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
	if (!match) return null
	const year = Number(match[1])
	if (year <= 1700) return null
	const birth = new Date(year, Number(match[2]) - 1, Number(match[3]))
	const now = new Date()
	let age = now.getFullYear() - birth.getFullYear()
	const monthDiff = now.getMonth() - birth.getMonth()
	if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
		age--
	}
	return age >= 0 && age < 200 ? age : null
}

function TypeChip({ type }: { type?: string }) {
	if (!type) return null
	return (
		<span className="ml-2 rounded bg-muted px-1.5 py-0.5 align-middle font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
			{type}
		</span>
	)
}

function PreviewRow({ label, type, children }: { label: string; type?: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="mb-0.5 text-xs text-muted-foreground">
				{label}
				<TypeChip type={type} />
			</div>
			<div className="text-sm text-foreground">{children}</div>
		</div>
	)
}

interface ContactPreviewProps {
	form: UseContactForm
	/** The saved contact, when editing an existing one. Omitted on the create
	 * screen, where there is no raw vCard metadata or delete affordance yet. */
	contact?: Contact
	onDelete?: () => void
}

/**
 * Read-only live preview of the contact being edited. Reflects the form state
 * in real time; raw vCard metadata is tucked behind a disclosure at the bottom.
 */
export function ContactPreview({ form, contact, onDelete }: ContactPreviewProps) {
	const {
		formData,
		fullName,
		phones,
		emails,
		addresses,
		urls,
		photoPreviewUrl,
		existingPhotoUrl,
		showExistingPhoto,
		setShowExistingPhoto,
		addressBooks,
		selectedBookIds,
	} = form
	const [showRaw, setShowRaw] = useState(false)
	const [showMenu, setShowMenu] = useState(false)

	const displayName = fullName.trim() || 'Unnamed contact'
	const initials =
		displayName
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map(part => part[0].toUpperCase())
			.join('') || '?'

	const subtitle = [formData.job_title, formData.organization].filter(Boolean).join(' · ')

	const memberBooks = addressBooks.filter(book => selectedBookIds.includes(book.id))

	const nonEmptyEmails = emails.filter(e => e.value.trim())
	const nonEmptyPhones = phones.filter(p => p.value.trim())
	const nonEmptyUrls = urls.filter(u => u.value.trim())
	const previewAddresses = addresses
		.map(address => ({ type: address.type, lines: formatAddressForDisplay(parseAddress(address.value || '')) }))
		.filter(address => address.lines.length > 0)

	const birthdayDisplay = formData.birthday ? formatBirthday(formData.birthday) : null
	const birthdayAge = formData.birthday ? getAge(formData.birthday) : null

	const photoSrc = photoPreviewUrl || (showExistingPhoto ? existingPhotoUrl : null)

	const primaryEmail = nonEmptyEmails[0]?.value
	const primaryPhone = nonEmptyPhones[0]?.value

	const rawEntries: Array<[string, string]> = [
		['PRODID', contact?.prod_id || ''],
		['REV', contact?.revision || ''],
		['X-IMAGEHASH', contact?.photo_hash || ''],
		['X-IMAGETYPE', contact?.photo_mime ? `PHOTO · ${contact.photo_mime}` : ''],
	].filter((entry): entry is [string, string] => Boolean(entry[1]))

	return (
		<div className="rounded-2xl border bg-card p-6 text-card-foreground">
			<div className="flex items-center gap-4">
				<div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-muted-foreground">
					{photoSrc ? (
						<img src={photoSrc} alt={displayName} className="size-full object-cover" onError={() => setShowExistingPhoto(false)} />
					) : (
						<span>{initials}</span>
					)}
				</div>
				<div className="min-w-0">
					<div className="truncate text-xl font-bold">{displayName}</div>
					{subtitle && <div className="truncate text-sm text-muted-foreground">{subtitle}</div>}
					{memberBooks.length > 0 && (
						<div className="mt-1.5 flex flex-wrap gap-1.5">
							{memberBooks.map(book => (
								<span key={book.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
									{book.name}
								</span>
							))}
						</div>
					)}
				</div>
			</div>

			<div className="relative mt-4 flex gap-2">
				{primaryEmail ? (
					<Button asChild variant="secondary" size="sm">
						<a href={`mailto:${primaryEmail}`}>
							<Mail className="size-4" />
							Email
						</a>
					</Button>
				) : (
					<Button variant="secondary" size="sm" disabled>
						<Mail className="size-4" />
						Email
					</Button>
				)}
				{primaryPhone ? (
					<Button asChild variant="secondary" size="sm">
						<a href={`tel:${primaryPhone}`}>
							<Phone className="size-4" />
							Call
						</a>
					</Button>
				) : (
					<Button variant="secondary" size="sm" disabled>
						<Phone className="size-4" />
						Call
					</Button>
				)}
				{onDelete && (
					<Button
						variant="secondary"
						size="sm"
						className="ml-auto px-2"
						aria-label="More actions"
						onClick={() => setShowMenu(prev => !prev)}
					>
						<MoreHorizontal className="size-4" />
					</Button>
				)}
				{onDelete && showMenu && (
					<>
						<div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
						<div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
							<button
								type="button"
								className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
								onClick={() => {
									setShowMenu(false)
									onDelete()
								}}
							>
								<Trash2 className="size-4" />
								Delete contact
							</button>
						</div>
					</>
				)}
			</div>

			<Separator className="my-5" />

			<div className="space-y-4">
				{nonEmptyEmails.length > 0 && (
					<PreviewRow label={nonEmptyEmails.length > 1 ? 'Emails' : 'Email'} type={nonEmptyEmails[0].type}>
						<div className="space-y-1">
							{nonEmptyEmails.map((email, index) => (
								<div key={index} className="break-all text-primary">
									{email.value}
									{index > 0 && <TypeChip type={email.type} />}
								</div>
							))}
						</div>
					</PreviewRow>
				)}

				{nonEmptyPhones.length > 0 && (
					<PreviewRow label={nonEmptyPhones.length > 1 ? 'Phones' : 'Phone'} type={nonEmptyPhones[0].type}>
						<div className="space-y-1">
							{nonEmptyPhones.map((phone, index) => (
								<div key={index} className="text-primary">
									{formatPhoneNumber(phone.value)}
									{index > 0 && <TypeChip type={phone.type} />}
								</div>
							))}
						</div>
					</PreviewRow>
				)}

				{previewAddresses.length > 0 && (
					<PreviewRow label={previewAddresses.length > 1 ? 'Addresses' : 'Address'} type={previewAddresses[0].type}>
						<div className="space-y-3">
							{previewAddresses.map((address, index) => (
								<div key={index} className="leading-relaxed">
									{address.lines.map((line, lineIndex) => (
										<div key={lineIndex}>{line}</div>
									))}
									{index > 0 && <TypeChip type={address.type} />}
								</div>
							))}
						</div>
					</PreviewRow>
				)}

				{nonEmptyUrls.length > 0 && (
					<PreviewRow label={nonEmptyUrls.length > 1 ? 'URLs' : 'URL'} type={nonEmptyUrls[0].type}>
						<div className="space-y-1">
							{nonEmptyUrls.map((url, index) => (
								<div key={index} className="break-all text-primary">
									{url.value}
									{index > 0 && <TypeChip type={url.type} />}
								</div>
							))}
						</div>
					</PreviewRow>
				)}

				{birthdayDisplay && (
					<PreviewRow label="Birthday">
						<div className="flex flex-wrap items-center gap-2">
							<Cake className="size-4 text-muted-foreground" />
							<span>{birthdayDisplay}</span>
							{birthdayAge !== null && (
								<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
									turns {birthdayAge + 1} this year
								</span>
							)}
						</div>
					</PreviewRow>
				)}

				{formData.notes.trim() && (
					<PreviewRow label="Notes">
						<p className="whitespace-pre-wrap leading-relaxed">{formData.notes}</p>
					</PreviewRow>
				)}
			</div>

			{rawEntries.length > 0 && (
				<>
					<Separator className="my-5" />
					<button
						type="button"
						className="text-xs text-muted-foreground hover:text-foreground"
						onClick={() => setShowRaw(prev => !prev)}
						aria-expanded={showRaw}
					>
						{showRaw ? '▾' : '▸'} Raw vCard
					</button>
					{showRaw && (
						<pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
							{rawEntries.map(([key, value]) => `${key}:${value}`).join('\n')}
						</pre>
					)}
				</>
			)}
		</div>
	)
}

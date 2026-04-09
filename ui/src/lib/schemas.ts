import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

export const ContactFieldSchema = z.object({
	value: z.string(),
	type: z.string().optional(),
})

export const CustomFieldSchema = z.object({
	key: z.string(),
	value: z.string(),
	params: z.array(z.string()).optional(),
})

// ---------------------------------------------------------------------------
// Contact schemas
// ---------------------------------------------------------------------------

/** Fields shared by both create and update contact payloads. */
const contactFieldsSchema = {
	full_name: z.string().nullish(),
	first_name: z.string().nullish(),
	last_name: z.string().nullish(),
	middle_name: z.string().nullish(),
	name_prefix: z.string().nullish(),
	name_suffix: z.string().nullish(),
	nickname: z.string().nullish(),
	maiden_name: z.string().nullish(),
	email: z.string().nullish(),
	phone: z.string().nullish(),
	phones: z.array(ContactFieldSchema).nullish(),
	emails: z.array(ContactFieldSchema).nullish(),
	organization: z.string().nullish(),
	org_units: z.array(z.string()).nullish(),
	job_title: z.string().nullish(),
	role: z.string().nullish(),
	address: z.string().nullish(),
	addresses: z.array(ContactFieldSchema).nullish(),
	address_street: z.string().nullish(),
	address_city: z.string().nullish(),
	address_state: z.string().nullish(),
	address_postal: z.string().nullish(),
	address_country: z.string().nullish(),
	birthday: z.string().nullish(),
	homepage: z.string().nullish(),
	urls: z.array(ContactFieldSchema).nullish(),
	categories: z.array(z.string()).nullish(),
	labels: z.array(ContactFieldSchema).nullish(),
	logos: z.array(ContactFieldSchema).nullish(),
	sounds: z.array(ContactFieldSchema).nullish(),
	keys: z.array(ContactFieldSchema).nullish(),
	mailer: z.string().nullish(),
	time_zone: z.string().nullish(),
	geo: z.string().nullish(),
	agent: z.string().nullish(),
	prod_id: z.string().nullish(),
	revision: z.string().nullish(),
	sort_string: z.string().nullish(),
	class: z.string().nullish(),
	custom_fields: z.array(CustomFieldSchema).nullish(),
	notes: z.string().nullish(),
	// Photo fields (inline base64)
	photo_data: z.string().nullish(),
	photo_mime: z.string().nullish(),
	photo_width: z.number().nullish(),
	photo_height: z.number().nullish(),
	photo_remove: z.boolean().optional(),
	// Address book assignment
	address_book_ids: z.array(z.string()).optional(),
}

export const CreateContactSchema = z.object(contactFieldsSchema).passthrough()

export const UpdateContactSchema = z.object(contactFieldsSchema).passthrough()

// ---------------------------------------------------------------------------
// Merge / bulk operations
// ---------------------------------------------------------------------------

export const MergeContactsSchema = z.object({
	contactIds: z.array(z.string()).min(2, 'At least 2 contacts are required to merge'),
})

export const BulkBooksSchema = z.object({
	contact_ids: z.array(z.string()).min(1, 'contact_ids must be a non-empty array'),
	add_to_book_ids: z.array(z.string()).optional().default([]),
	remove_from_book_ids: z.array(z.string()).optional().default([]),
}).refine(
	(data) => (data.add_to_book_ids?.length ?? 0) > 0 || (data.remove_from_book_ids?.length ?? 0) > 0,
	{ message: 'Provide at least one of add_to_book_ids or remove_from_book_ids' }
)

// ---------------------------------------------------------------------------
// Address books
// ---------------------------------------------------------------------------

export const CreateAddressBookSchema = z.object({
	name: z.string().trim().min(1, 'Name is required'),
	slug: z.string().optional(),
	is_public: z.boolean().optional().default(true),
})

export const UpdateAddressBookSchema = z.object({
	name: z.string().trim().min(1, 'Name cannot be empty').optional(),
	is_public: z.boolean().optional(),
	readonly_enabled: z.boolean().optional(),
	readonly_password: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Radicale users (proxied to sync-service)
// ---------------------------------------------------------------------------

export const CreateRadicaleUserSchema = z.object({
	username: z.string().min(1, 'Username is required'),
	password: z.string().min(1, 'Password is required'),
})

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const PaginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(500).optional().default(100),
	offset: z.coerce.number().int().min(0).optional().default(0),
})

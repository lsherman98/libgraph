/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
	Authorigins = "_authOrigins",
	Externalauths = "_externalAuths",
	Mfas = "_mfas",
	Otps = "_otps",
	Superusers = "_superusers",
	Bookmarks = "bookmarks",
	Chats = "chats",
	Collections = "collections",
	DocumentChunks = "document_chunks",
	Edges = "edges",
	Highlights = "highlights",
	Messages = "messages",
	Nodes = "nodes",
	Notes = "notes",
	Pages = "pages",
	People = "people",
	Preferences = "preferences",
	Publications = "publications",
	ReadingProgress = "reading_progress",
	Tags = "tags",
	Topics = "topics",
	Uploads = "uploads",
	Users = "users",
	WritingProjects = "writing_projects",
}

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export type BookmarksRecord = {
	block_id: string
	comment?: string
	created: IsoAutoDateString
	id: string
	page: RecordIdString
	page_number: number
	tags?: RecordIdString[]
	updated: IsoAutoDateString
	upload: RecordIdString
	user: RecordIdString
}

export enum ChatsTypeOptions {
	"search" = "search",
	"chat" = "chat",
}
export type ChatsRecord = {
	created: IsoAutoDateString
	id: string
	title?: string
	type?: ChatsTypeOptions
	updated: IsoAutoDateString
	user: RecordIdString
}

export type CollectionsRecord = {
	created: IsoAutoDateString
	description?: string
	id: string
	name?: string
	updated: IsoAutoDateString
	uploads?: RecordIdString[]
	user: RecordIdString
}

export type DocumentChunksRecord = {
	chunk_index: number
	content: string
	created: IsoAutoDateString
	id: string
	page: RecordIdString
	page_number: number
	updated: IsoAutoDateString
	upload: RecordIdString
	user: RecordIdString
	vector_id?: number
}

export enum EdgesTypeOptions {
	"authored_by" = "authored_by",
	"tagged_with" = "tagged_with",
	"belongs_to" = "belongs_to",
	"highlight_of" = "highlight_of",
	"bookmark_of" = "bookmark_of",
	"note_of" = "note_of",
	"published_by" = "published_by",
	"about_person" = "about_person",
	"links_to" = "links_to",
}
export type EdgesRecord = {
	created: IsoAutoDateString
	id: string
	source: RecordIdString
	target: RecordIdString
	type: EdgesTypeOptions
	updated: IsoAutoDateString
	user: RecordIdString
}

export enum HighlightsColorOptions {
	"yellow" = "yellow",
	"green" = "green",
	"blue" = "blue",
	"pink" = "pink",
	"purple" = "purple",
}
export type HighlightsRecord = {
	color: HighlightsColorOptions
	comment?: string
	created: IsoAutoDateString
	end_offset: number
	id: string
	page: RecordIdString
	start_offset: number
	tags?: RecordIdString[]
	text?: string
	updated: IsoAutoDateString
	upload: RecordIdString
	user: RecordIdString
}

export enum MessagesRoleOptions {
	"user" = "user",
	"assistant" = "assistant",
}
export type MessagesRecord<Tsources = unknown> = {
	chat: RecordIdString
	content?: string
	created: IsoAutoDateString
	id: string
	role: MessagesRoleOptions
	sources?: null | Tsources
	updated: IsoAutoDateString
	user: RecordIdString
}

export enum NodesTypeOptions {
	"author" = "author",
	"tag" = "tag",
	"topic" = "topic",
	"upload" = "upload",
	"highlight" = "highlight",
	"bookmark" = "bookmark",
	"note" = "note",
}
export type NodesRecord<Tdata = unknown> = {
	created: IsoAutoDateString
	data?: null | Tdata
	id: string
	label?: string
	record_id: string
	type: NodesTypeOptions
	updated: IsoAutoDateString
	user: RecordIdString
}

export type NotesRecord = {
	block_id: string
	content?: string
	created: IsoAutoDateString
	id: string
	page: RecordIdString
	page_number: number
	tags?: RecordIdString[]
	updated: IsoAutoDateString
	upload: RecordIdString
	user: RecordIdString
}

export type PagesRecord = {
	created: IsoAutoDateString
	id: string
	llama_file_id?: string
	markdown: FileNameString
	page: number
	updated: IsoAutoDateString
	upload: RecordIdString
	user: RecordIdString
}

export enum PeopleTypeOptions {
	"youtube_channel" = "youtube_channel",
	"author" = "author",
	"publication" = "publication",
	"podcast" = "podcast",
}
export type PeopleRecord = {
	created: IsoAutoDateString
	id: string
	name?: string
	source?: string
	type: PeopleTypeOptions
	updated: IsoAutoDateString
	user: RecordIdString
}

export type PreferencesRecord<Treader_settings = unknown, Tui_settings = unknown, Tworkspace_layout = unknown> = {
	created: IsoAutoDateString
	id: string
	reader_settings?: null | Treader_settings
	ui_settings?: null | Tui_settings
	updated: IsoAutoDateString
	user: RecordIdString
	workspace_layout?: null | Tworkspace_layout
}

export enum PublicationsTypeOptions {
	"podcast" = "podcast",
	"youtube_channel" = "youtube_channel",
	"blog" = "blog",
	"other" = "other",
}
export type PublicationsRecord = {
	created: IsoAutoDateString
	id: string
	name?: string
	type?: PublicationsTypeOptions
	updated: IsoAutoDateString
	url?: string
	user: RecordIdString
}

export type ReadingProgressRecord = {
	created: IsoAutoDateString
	current_page?: number
	id: string
	scroll_position?: number
	updated: IsoAutoDateString
	upload?: RecordIdString
	user?: RecordIdString
}

export type TagsRecord = {
	created: IsoAutoDateString
	id: string
	title?: string
	updated: IsoAutoDateString
	user: RecordIdString
}

export type TopicsRecord = {
	created: IsoAutoDateString
	id: string
	title?: string
	updated: IsoAutoDateString
	user: RecordIdString
}

export enum UploadsTypeOptions {
	"book" = "book",
	"article" = "article",
	"podcast" = "podcast",
	"lecture" = "lecture",
	"youtube" = "youtube",
	"essay" = "essay",
}

export enum UploadsStatusOptions {
	"PENDING" = "PENDING",
	"PROCESSING" = "PROCESSING",
	"FAILED" = "FAILED",
	"SUCCESS" = "SUCCESS",
}
export type UploadsRecord = {
	created: IsoAutoDateString
	file: FileNameString
	id: string
	llama_file_id?: string
	num_pages?: number
	people?: RecordIdString[]
	publication?: RecordIdString
	status?: UploadsStatusOptions
	tags?: RecordIdString[]
	title?: string
	topic?: RecordIdString[]
	type: UploadsTypeOptions
	updated: IsoAutoDateString
	uploads?: RecordIdString[]
	user: RecordIdString
}

export type UsersRecord = {
	avatar?: FileNameString
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export enum WritingProjectsStatusOptions {
	"draft" = "draft",
	"published" = "published",
	"archived" = "archived",
}
export type WritingProjectsRecord = {
	bookmarks?: RecordIdString[]
	content?: HTMLString
	created: IsoAutoDateString
	highlights?: RecordIdString[]
	id: string
	notes?: RecordIdString[]
	status?: WritingProjectsStatusOptions
	tags?: RecordIdString[]
	title?: string
	topics?: RecordIdString[]
	updated: IsoAutoDateString
	uploads?: RecordIdString[]
	user: RecordIdString
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type BookmarksResponse<Texpand = unknown> = Required<BookmarksRecord> & BaseSystemFields<Texpand>
export type ChatsResponse<Texpand = unknown> = Required<ChatsRecord> & BaseSystemFields<Texpand>
export type CollectionsResponse<Texpand = unknown> = Required<CollectionsRecord> & BaseSystemFields<Texpand>
export type DocumentChunksResponse<Texpand = unknown> = Required<DocumentChunksRecord> & BaseSystemFields<Texpand>
export type EdgesResponse<Texpand = unknown> = Required<EdgesRecord> & BaseSystemFields<Texpand>
export type HighlightsResponse<Texpand = unknown> = Required<HighlightsRecord> & BaseSystemFields<Texpand>
export type MessagesResponse<Tsources = unknown, Texpand = unknown> = Required<MessagesRecord<Tsources>> & BaseSystemFields<Texpand>
export type NodesResponse<Tdata = unknown, Texpand = unknown> = Required<NodesRecord<Tdata>> & BaseSystemFields<Texpand>
export type NotesResponse<Texpand = unknown> = Required<NotesRecord> & BaseSystemFields<Texpand>
export type PagesResponse<Texpand = unknown> = Required<PagesRecord> & BaseSystemFields<Texpand>
export type PeopleResponse<Texpand = unknown> = Required<PeopleRecord> & BaseSystemFields<Texpand>
export type PreferencesResponse<Treader_settings = unknown, Tui_settings = unknown, Tworkspace_layout = unknown, Texpand = unknown> = Required<PreferencesRecord<Treader_settings, Tui_settings, Tworkspace_layout>> & BaseSystemFields<Texpand>
export type PublicationsResponse<Texpand = unknown> = Required<PublicationsRecord> & BaseSystemFields<Texpand>
export type ReadingProgressResponse<Texpand = unknown> = Required<ReadingProgressRecord> & BaseSystemFields<Texpand>
export type TagsResponse<Texpand = unknown> = Required<TagsRecord> & BaseSystemFields<Texpand>
export type TopicsResponse<Texpand = unknown> = Required<TopicsRecord> & BaseSystemFields<Texpand>
export type UploadsResponse<Texpand = unknown> = Required<UploadsRecord> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>
export type WritingProjectsResponse<Texpand = unknown> = Required<WritingProjectsRecord> & BaseSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	bookmarks: BookmarksRecord
	chats: ChatsRecord
	collections: CollectionsRecord
	document_chunks: DocumentChunksRecord
	edges: EdgesRecord
	highlights: HighlightsRecord
	messages: MessagesRecord
	nodes: NodesRecord
	notes: NotesRecord
	pages: PagesRecord
	people: PeopleRecord
	preferences: PreferencesRecord
	publications: PublicationsRecord
	reading_progress: ReadingProgressRecord
	tags: TagsRecord
	topics: TopicsRecord
	uploads: UploadsRecord
	users: UsersRecord
	writing_projects: WritingProjectsRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	bookmarks: BookmarksResponse
	chats: ChatsResponse
	collections: CollectionsResponse
	document_chunks: DocumentChunksResponse
	edges: EdgesResponse
	highlights: HighlightsResponse
	messages: MessagesResponse
	nodes: NodesResponse
	notes: NotesResponse
	pages: PagesResponse
	people: PeopleResponse
	preferences: PreferencesResponse
	publications: PublicationsResponse
	reading_progress: ReadingProgressResponse
	tags: TagsResponse
	topics: TopicsResponse
	uploads: UploadsResponse
	users: UsersResponse
	writing_projects: WritingProjectsResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
	collection<T extends keyof CollectionResponses>(
		idOrName: T
	): RecordService<CollectionResponses[T]>
} & PocketBase

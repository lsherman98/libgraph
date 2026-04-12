import type {
    NodesResponse,
    UploadsResponse,
    HighlightsResponse,
    BookmarksResponse,
    PeopleResponse,
    PublicationsResponse,
    TagsResponse,
    TopicsResponse,
    PagesResponse,
    NotesResponse,
    NodesTypeOptions,
} from "./pocketbase-types";

export type NodeRecordData =
    | UploadsResponse
    | HighlightsResponse
    | BookmarksResponse
    | PeopleResponse
    | PublicationsResponse
    | TagsResponse
    | TopicsResponse
    | PagesResponse
    | NotesResponse;

export interface UploadNodeData {
    title?: string;
    type?: string;
    status?: string;
    num_pages?: number;
}

export interface AuthorNodeData {
    name?: string;
    type?: string;
    source?: string;
}

export interface PublicationNodeData {
    name?: string;
    type?: string;
    url?: string;
}

export interface TagNodeData {
    title?: string;
}

export interface TopicNodeData {
    title?: string;
}

export interface HighlightNodeData {
    text?: string;
    color?: string;
    comment?: string;
}

export interface BookmarkNodeData {
    comment?: string;
    page_number?: number;
}

export interface NoteNodeData {
    content?: string;
    page_number?: number;
}

export type NodeData =
    | UploadNodeData
    | AuthorNodeData
    | PublicationNodeData
    | TagNodeData
    | TopicNodeData
    | HighlightNodeData
    | BookmarkNodeData
    | NoteNodeData;

export type EnrichedNodesResponse<Texpand = unknown> = NodesResponse<NodeData> & {
    record_data?: NodeRecordData;
} & (Texpand extends unknown ? {} : { expand: Texpand });

export type NodeRecordDataByType<T extends NodesTypeOptions> = T extends "upload"
    ? UploadsResponse
    : T extends "highlight"
    ? HighlightsResponse
    : T extends "bookmark"
    ? BookmarksResponse
    : T extends "author"
    ? PeopleResponse
    : T extends "publication"
    ? PublicationsResponse
    : T extends "tag"
    ? TagsResponse
    : T extends "topic"
    ? TopicsResponse
    : T extends "page"
    ? PagesResponse
    : never;

export interface FTSSearchResult {
    id: string;
    content: string;
    upload: string;
    page: string;
    page_number: string;
    chunk_index: string;
}

export interface ChatResponseData {
    chat_id: string;
    status?: string;
    message?: string;
    sources?: ChatSource[];
    user_message_id: string;
    assistant_message_id: string;
}

export interface ChatSource {
    upload_id?: string;
    node_id?: string;
    title?: string;
    score?: number;
    text?: string;
    page_number?: number;
}

export interface ChatFilters {
    condition?: 'and' | 'or';
    tags?: string[];
    people?: string[];
    publications?: string[];
    types?: string[];
    topics?: string[];
    uploads?: string[];
    collections?: string[];
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}
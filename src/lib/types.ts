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

// Type for the record data that can be attached to a node
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

// Typed node data stored in the JSON `data` field per node type
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

// Extended node response that includes the enriched record data from the backend hook
export type EnrichedNodesResponse<Texpand = unknown> = NodesResponse<NodeData> & {
    record_data?: NodeRecordData;
} & (Texpand extends unknown ? {} : { expand: Texpand });

// Helper type to get the correct record data type based on node type
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


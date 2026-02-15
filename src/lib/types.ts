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
    page_number: string;
    chunk_index: string;
}

export interface ChatResponseData {
    sources?: ChatSource[];
}

export interface RetrievalParameters {
    alpha?: number;
    dense_similarity_cutoff?: number;
    dense_similarity_top_k?: number;
    enable_reranking?: boolean;
    files_top_k?: number;
    rerank_top_n?: number;
    retrieval_mode?: 'chunks' | 'files';
    retrieve_page_figure_nodes?: boolean;
    retrieve_page_screenshot_nodes?: boolean;
    sparse_similarity_top_k?: number;
}

export interface LLMParameters {
    model_name?: string;
    system_prompt?: string;
    temperature?: number;
    use_chain_of_thought_reasoning?: boolean;
    use_citation?: boolean;
}

export interface ChatSource {
    upload_id?: string;
    external_file_id?: string;
    node_id?: string;
    title?: string;
    score?: number;
    text?: string;
    page_number?: number;
    start_char_idx?: number;
    end_char_idx?: number;
}

export interface ChatFilters {
    condition?: 'and' | 'or';
    tags?: string[];
    subjects?: string[];
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
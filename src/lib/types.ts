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
    | PagesResponse;

// Extended node response that includes the enriched record data from the backend hook
export type EnrichedNodesResponse<Texpand = unknown> = NodesResponse<Texpand> & {
    record_data?: NodeRecordData;
};

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


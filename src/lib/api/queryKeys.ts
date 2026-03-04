import type { UploadFilters } from "./api";
import type { NodesTypeOptions } from "../pocketbase-types";

export const queryKeys = {
    uploads: {
        all: ["uploads"] as const,
        list: (filters?: UploadFilters) => [...queryKeys.uploads.all, "list", filters] as const,
        detail: (id: string) => [...queryKeys.uploads.all, "detail", id] as const,
    },
    people: {
        all: ["people"] as const,
    },
    publications: {
        all: ["publications"] as const,
    },
    tags: {
        all: ["tags"] as const,
    },
    topics: {
        all: ["topics"] as const,
    },
    pages: {
        all: ["pages"] as const,
        list: (uploadId?: string, page?: number, perPage?: number) =>
            [...queryKeys.pages.all, "list", uploadId, page, perPage] as const,
        infinite: (uploadId?: string, perPage?: number, initialPage?: number) =>
            [...queryKeys.pages.all, "infinite", uploadId, perPage, initialPage] as const,
        first: (uploadId: string) =>
            [...queryKeys.pages.all, "first", uploadId] as const,
        byNumber: (uploadId: string, pageNumber: number) =>
            [...queryKeys.pages.all, "byNumber", uploadId, pageNumber] as const,
        markdown: (pageId?: string) =>
            [...queryKeys.pages.all, "markdown", pageId] as const,
    },
    summaries: {
        all: ["summaries"] as const,
        bySourcePage: (pageId?: string) =>
            [...queryKeys.summaries.all, "sourcePage", pageId] as const,
        bySourceUpload: (uploadId?: string) =>
            [...queryKeys.summaries.all, "sourceUpload", uploadId] as const,
    },
    highlights: {
        all: ["highlights"] as const,
        byUpload: (uploadId?: string) =>
            [...queryKeys.highlights.all, "upload", uploadId] as const,
        byPage: (pageId: string) =>
            [...queryKeys.highlights.all, "page", pageId] as const,
    },
    bookmarks: {
        all: ["bookmarks"] as const,
        byUpload: (uploadId?: string) =>
            [...queryKeys.bookmarks.all, "upload", uploadId] as const,
    },
    notes: {
        all: ["notes"] as const,
        byUpload: (uploadId?: string) =>
            [...queryKeys.notes.all, "upload", uploadId] as const,
    },
    nodes: {
        all: ["nodes"] as const,
        list: (type?: NodesTypeOptions) =>
            [...queryKeys.nodes.all, "list", type] as const,
        detail: (id: string) =>
            [...queryKeys.nodes.all, "detail", id] as const,
    },
    edges: {
        all: ["edges"] as const,
        list: (filters?: { sourceId?: string; targetId?: string; type?: string }) =>
            [...queryKeys.edges.all, "list", filters] as const,
        detail: (id: string) =>
            [...queryKeys.edges.all, "detail", id] as const,
    },
    graph: {
        all: ["graph"] as const,
    },
    writingProjects: {
        all: ["writingProjects"] as const,
        list: () => [...queryKeys.writingProjects.all, "list"] as const,
        detail: (id?: string) =>
            [...queryKeys.writingProjects.all, "detail", id] as const,
    },
    workspaceMaterials: {
        all: ["workspaceMaterials"] as const,
    },
    collections: {
        all: ["collections"] as const,
        list: () => [...queryKeys.collections.all, "list"] as const,
        detail: (id: string) =>
            [...queryKeys.collections.all, "detail", id] as const,
    },
    chats: {
        all: ["chats"] as const,
        list: (type?: "chat" | "search") =>
            [...queryKeys.chats.all, "list", type] as const,
        detail: (id: string) =>
            [...queryKeys.chats.all, "detail", id] as const,
    },
    messages: {
        all: ["messages"] as const,
        byChat: (chatId?: string) =>
            [...queryKeys.messages.all, chatId] as const,
    },
    fts: {
        all: ["fts"] as const,
        search: (uploadId: string, query: string) =>
            [...queryKeys.fts.all, uploadId, query] as const,
    },
    preferences: {
        all: ["preferences"] as const,
    },
    readingProgress: {
        all: ["readingProgress"] as const,
        byUpload: (uploadId: string) =>
            [...queryKeys.readingProgress.all, uploadId] as const,
    },
} as const;

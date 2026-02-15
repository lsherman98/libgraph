import { keepPreviousData, useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getPeople, getPublications, getFirstPage, getPageByNumber, getPages, getPageUrl, getTags, getTopics, getUploads, getUpload, getHighlights, getHighlightsForPage, getBookmarks, getNotes, getNodes, getNodeById, getEdges, getEdgeById, getGraphData, getWritingProjects, getWritingProject, getWorkspaceMaterials, getChats, getChat, getMessages, getCollections, getCollection, fullTextSearch } from "./api";
import type { NodesTypeOptions } from "../pocketbase-types";

export function usePeople() {
    return useQuery({
        queryKey: ["people"],
        queryFn: getPeople,
        placeholderData: keepPreviousData
    });
}

export function usePublications() {
    return useQuery({
        queryKey: ["publications"],
        queryFn: getPublications,
        placeholderData: keepPreviousData
    });
}

export function useTags() {
    return useQuery({
        queryKey: ["tags"],
        queryFn: getTags,
        placeholderData: keepPreviousData
    });
}

export function useTopics() {
    return useQuery({
        queryKey: ["topics"],
        queryFn: getTopics,
        placeholderData: keepPreviousData
    });
}

export function useUploads() {
    return useQuery({
        queryKey: ["uploads"],
        queryFn: getUploads,
        placeholderData: keepPreviousData
    });
}

export function useUploadById(id: string) {
    return useQuery({
        queryKey: ["upload", id],
        queryFn: () => getUpload(id),
        enabled: !!id,
        placeholderData: keepPreviousData
    });
}

export function useFirstPage(uploadId: string) {
    return useQuery({
        queryKey: ["firstPage", uploadId],
        queryFn: () => getFirstPage(uploadId),
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

export function usePageByNumber(uploadId: string, pageNumber: number) {
    return useQuery({
        queryKey: ["pageByNumber", uploadId, pageNumber],
        queryFn: () => getPageByNumber(uploadId, pageNumber),
        enabled: !!uploadId && pageNumber != null,
        placeholderData: keepPreviousData
    });
}

export function usePageMarkdown(pageId?: string) {
    return useQuery({
        queryKey: ["pageMarkdown", pageId],
        queryFn: async () => {
            const url = await getPageUrl(pageId);
            if (!url) return null;
            const response = await fetch(url);
            return await response.text();
        },
        enabled: !!pageId,
        placeholderData: keepPreviousData
    });
}

export function usePages(uploadId?: string, page: number = 1, perPage: number = 20) {
    return useQuery({
        queryKey: ["pages", uploadId, page, perPage],
        queryFn: () => getPages(uploadId, page, perPage),
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

export function useInfinitePages(uploadId?: string, perPage: number = 5, initialPage: number = 1) {
    return useInfiniteQuery({
        queryKey: ["pages-infinite", uploadId, perPage, initialPage],
        queryFn: ({ pageParam }) => getPages(uploadId, pageParam as number, perPage),
        initialPageParam: initialPage,
        getNextPageParam: (lastPage) => lastPage && lastPage.page != null && lastPage.totalPages != null && lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        enabled: !!uploadId
    });
}

// Highlights hooks
export function useHighlights(uploadId?: string) {
    return useQuery({
        queryKey: ["highlights", uploadId],
        queryFn: () => getHighlights(uploadId),
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

export function usePageHighlights(pageId: string) {
    return useQuery({
        queryKey: ["highlights", "page", pageId],
        queryFn: () => getHighlightsForPage(pageId),
        enabled: !!pageId,
        placeholderData: keepPreviousData
    });
}

// Bookmarks hooks
export function useBookmarks(uploadId?: string) {
    return useQuery({
        queryKey: ["bookmarks", uploadId],
        queryFn: () => getBookmarks(uploadId),
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

// Notes hooks
export function useNotes(uploadId?: string) {
    return useQuery({
        queryKey: ["notes", uploadId],
        queryFn: () => getNotes(uploadId),
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

export function useNodes(type?: NodesTypeOptions) {
    return useQuery({
        queryKey: ["nodes", type],
        queryFn: () => getNodes(type),
        placeholderData: keepPreviousData
    });
}

export function useNode(id: string) {
    return useQuery({
        queryKey: ["node", id],
        queryFn: () => getNodeById(id),
        enabled: !!id,
        placeholderData: keepPreviousData
    });
}

// Edges hooks
export function useEdges(filters?: { sourceId?: string; targetId?: string; type?: string }) {
    return useQuery({
        queryKey: ["edges", filters],
        queryFn: () => getEdges(filters),
        placeholderData: keepPreviousData
    });
}

export function useEdge(id: string) {
    return useQuery({
        queryKey: ["edge", id],
        queryFn: () => getEdgeById(id),
        enabled: !!id,
        placeholderData: keepPreviousData
    });
}

export function useGraphData() {
    return useQuery({
        queryKey: ["graph"],
        queryFn: getGraphData,
        placeholderData: keepPreviousData
    });
}

export function useWritingProjects() {
    return useQuery({
        queryKey: ["writingProjects"],
        queryFn: getWritingProjects,
        placeholderData: keepPreviousData
    });
}

export function useWritingProject(id?: string) {
    return useQuery({
        queryKey: ["writingProject", id],
        queryFn: () => getWritingProject(id),
        enabled: !!id,
        placeholderData: keepPreviousData
    });
}

export function useWorkspaceMaterials() {
    return useQuery({
        queryKey: ["workspaceMaterials"],
        queryFn: getWorkspaceMaterials,
        placeholderData: keepPreviousData
    });
}

export function useCollections() {
    return useQuery({
        queryKey: ["collections"],
        queryFn: getCollections,
        placeholderData: keepPreviousData
    });
}

export function useCollection(id: string) {
    return useQuery({
        queryKey: ["collection", id],
        queryFn: () => getCollection(id),
        enabled: !!id,
        placeholderData: keepPreviousData
    });
}

export function useChats(type?: "chat" | "search") {
    return useQuery({
        queryKey: ["chats", type],
        queryFn: () => getChats(type),
        placeholderData: keepPreviousData
    });
}

export function useChat(id: string) {
    return useQuery({
        queryKey: ["chat", id],
        queryFn: () => getChat(id),
        enabled: !!id,
        placeholderData: keepPreviousData
    });
}

export function useMessages(chatId?: string) {
    return useQuery({
        queryKey: ["messages", chatId],
        queryFn: () => getMessages(chatId),
        enabled: !!chatId,
        placeholderData: keepPreviousData
    });
}

export function useFullTextSearch(uploadId: string, query: string) {
    return useQuery({
        queryKey: ["fts", uploadId, query],
        queryFn: () => fullTextSearch(uploadId, query),
        enabled: !!uploadId && query.trim().length > 0,
        placeholderData: keepPreviousData,
    });
}

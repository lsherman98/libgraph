import { keepPreviousData, useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getPeople, getPublications, getFirstPage, getPageByNumber, getPages, getPageUrl, getTags, getTopics, getUploads, getUpload, getHighlights, getHighlightsForPage, getBookmarks, getNotes, getNodes, getNodeById, getEdges, getEdgeById, getGraphData, getWritingProjects, getWritingProject, getWorkspaceMaterials, getChats, getChat, getMessages, getCollections, getCollection, fullTextSearch, getPreferences, getReadingProgress, getSummaryBySourcePage, getSummaryBySourceUpload, getSidebarChats, getChatContexts } from "./api";
import type { UploadFilters } from "./api";
import type { NodesTypeOptions } from "../pocketbase-types";
import { queryKeys } from "./queryKeys";

const STALE_REFERENCE = 5 * 60 * 1000;  // 5 min
const STALE_AGGREGATE = 2 * 60 * 1000;  // 2 min
const STALE_CONTENT = 10 * 60 * 1000;   // 10 min
const STALE_SEARCH = 30 * 1000;         // 30 s

export function usePeople() {
    return useQuery({
        queryKey: queryKeys.people.all,
        queryFn: getPeople,
        staleTime: STALE_REFERENCE,
        placeholderData: keepPreviousData,
    });
}

export function usePublications() {
    return useQuery({
        queryKey: queryKeys.publications.all,
        queryFn: getPublications,
        staleTime: STALE_REFERENCE,
        placeholderData: keepPreviousData,
    });
}

export function useTags() {
    return useQuery({
        queryKey: queryKeys.tags.all,
        queryFn: getTags,
        staleTime: STALE_REFERENCE,
        placeholderData: keepPreviousData,
    });
}

export function useTopics() {
    return useQuery({
        queryKey: queryKeys.topics.all,
        queryFn: getTopics,
        staleTime: STALE_REFERENCE,
        placeholderData: keepPreviousData,
    });
}

export function useUploads(filters?: UploadFilters) {
    return useQuery({
        queryKey: queryKeys.uploads.list(filters),
        queryFn: () => getUploads(filters),
        placeholderData: keepPreviousData,
    });
}

export function useUploadById(id: string) {
    return useQuery({
        queryKey: queryKeys.uploads.detail(id),
        queryFn: () => getUpload(id),
        enabled: !!id,
        placeholderData: keepPreviousData,
    });
}

export function useFirstPage(uploadId: string) {
    return useQuery({
        queryKey: queryKeys.pages.first(uploadId),
        queryFn: () => getFirstPage(uploadId),
        enabled: !!uploadId,
        placeholderData: keepPreviousData,
    });
}

export function usePageByNumber(uploadId: string, pageNumber: number) {
    return useQuery({
        queryKey: queryKeys.pages.byNumber(uploadId, pageNumber),
        queryFn: () => getPageByNumber(uploadId, pageNumber),
        enabled: !!uploadId && pageNumber != null,
        placeholderData: keepPreviousData,
    });
}

export function usePageMarkdown(pageId?: string) {
    return useQuery({
        queryKey: queryKeys.pages.markdown(pageId),
        queryFn: async () => {
            const url = await getPageUrl(pageId);
            if (!url) return null;
            const response = await fetch(url);
            return await response.text();
        },
        enabled: !!pageId,
        staleTime: STALE_CONTENT,
        placeholderData: keepPreviousData,
    });
}

export function usePages(uploadId?: string, page: number = 1, perPage: number = 20) {
    return useQuery({
        queryKey: queryKeys.pages.list(uploadId, page, perPage),
        queryFn: () => getPages(uploadId, page, perPage),
        enabled: !!uploadId,
        placeholderData: keepPreviousData,
    });
}

export function useSummaryBySourcePage(pageId?: string, options?: { pollUntilFound?: boolean }) {
    return useQuery({
        queryKey: queryKeys.summaries.bySourcePage(pageId),
        queryFn: () => getSummaryBySourcePage(pageId),
        enabled: !!pageId,
        refetchInterval: (query) => {
            if (!options?.pollUntilFound) return false;
            return query.state.data ? false : 2000;
        },
        placeholderData: keepPreviousData,
    });
}

export function useSummaryBySourceUpload(uploadId?: string, options?: { pollUntilFound?: boolean }) {
    return useQuery({
        queryKey: queryKeys.summaries.bySourceUpload(uploadId),
        queryFn: () => getSummaryBySourceUpload(uploadId),
        enabled: !!uploadId,
        refetchInterval: (query) => {
            if (!options?.pollUntilFound) return false;
            return query.state.data ? false : 2000;
        },
        placeholderData: keepPreviousData,
    });
}

export function useInfinitePages(uploadId?: string, perPage: number = 5, initialPage: number = 1) {
    return useInfiniteQuery({
        queryKey: queryKeys.pages.infinite(uploadId, perPage, initialPage),
        queryFn: ({ pageParam }) => getPages(uploadId, pageParam as number, perPage),
        initialPageParam: initialPage,
        getNextPageParam: (lastPage) =>
            lastPage && lastPage.page != null && lastPage.totalPages != null && lastPage.page < lastPage.totalPages
                ? lastPage.page + 1
                : undefined,
        enabled: !!uploadId,
    });
}

export function useHighlights(uploadId?: string) {
    return useQuery({
        queryKey: queryKeys.highlights.byUpload(uploadId),
        queryFn: () => getHighlights(uploadId),
        enabled: !!uploadId,
        placeholderData: keepPreviousData,
    });
}

export function usePageHighlights(pageId: string) {
    return useQuery({
        queryKey: queryKeys.highlights.byPage(pageId),
        queryFn: () => getHighlightsForPage(pageId),
        enabled: !!pageId,
        placeholderData: keepPreviousData,
    });
}

export function useBookmarks(uploadId?: string) {
    return useQuery({
        queryKey: queryKeys.bookmarks.byUpload(uploadId),
        queryFn: () => getBookmarks(uploadId),
        enabled: !!uploadId,
        placeholderData: keepPreviousData,
    });
}

export function useNotes(uploadId?: string) {
    return useQuery({
        queryKey: queryKeys.notes.byUpload(uploadId),
        queryFn: () => getNotes(uploadId),
        enabled: !!uploadId,
        placeholderData: keepPreviousData,
    });
}

export function useNodes(type?: NodesTypeOptions) {
    return useQuery({
        queryKey: queryKeys.nodes.list(type),
        queryFn: () => getNodes(type),
        placeholderData: keepPreviousData,
    });
}

export function useNode(id: string) {
    return useQuery({
        queryKey: queryKeys.nodes.detail(id),
        queryFn: () => getNodeById(id),
        enabled: !!id,
        placeholderData: keepPreviousData,
    });
}

export function useEdges(filters?: { sourceId?: string; targetId?: string; type?: string }) {
    return useQuery({
        queryKey: queryKeys.edges.list(filters),
        queryFn: () => getEdges(filters),
        placeholderData: keepPreviousData,
    });
}

export function useEdge(id: string) {
    return useQuery({
        queryKey: queryKeys.edges.detail(id),
        queryFn: () => getEdgeById(id),
        enabled: !!id,
        placeholderData: keepPreviousData,
    });
}

export function useGraphData() {
    return useQuery({
        queryKey: queryKeys.graph.all,
        queryFn: getGraphData,
        staleTime: STALE_AGGREGATE,
        placeholderData: keepPreviousData,
    });
}

export function useWritingProjects() {
    return useQuery({
        queryKey: queryKeys.writingProjects.list(),
        queryFn: getWritingProjects,
        placeholderData: keepPreviousData,
    });
}

export function useWritingProject(id?: string) {
    return useQuery({
        queryKey: queryKeys.writingProjects.detail(id),
        queryFn: () => getWritingProject(id),
        enabled: !!id,
        placeholderData: keepPreviousData,
    });
}

export function useWorkspaceMaterials() {
    return useQuery({
        queryKey: queryKeys.workspaceMaterials.all,
        queryFn: getWorkspaceMaterials,
        staleTime: STALE_AGGREGATE,
        placeholderData: keepPreviousData,
    });
}

export function useCollections() {
    return useQuery({
        queryKey: queryKeys.collections.list(),
        queryFn: getCollections,
        placeholderData: keepPreviousData,
    });
}

export function useCollection(id: string) {
    return useQuery({
        queryKey: queryKeys.collections.detail(id),
        queryFn: () => getCollection(id),
        enabled: !!id,
        placeholderData: keepPreviousData,
    });
}

export function useChats(type?: "chat" | "search") {
    return useQuery({
        queryKey: queryKeys.chats.list(type),
        queryFn: () => getChats(type),
        placeholderData: keepPreviousData,
    });
}

export function useChat(id: string) {
    return useQuery({
        queryKey: queryKeys.chats.detail(id),
        queryFn: () => getChat(id),
        enabled: !!id,
        placeholderData: keepPreviousData,
    });
}

export function useMessages(chatId?: string) {
    return useQuery({
        queryKey: queryKeys.messages.byChat(chatId),
        queryFn: () => getMessages(chatId),
        enabled: !!chatId,
        placeholderData: keepPreviousData,
    });
}

export function useSidebarChats() {
    return useQuery({
        queryKey: queryKeys.sidebarChats.list(),
        queryFn: getSidebarChats,
        placeholderData: keepPreviousData,
    });
}

export function useChatContexts(chatId?: string) {
    return useQuery({
        queryKey: queryKeys.chatContexts.byChat(chatId),
        queryFn: () => getChatContexts(chatId!),
        enabled: !!chatId,
        placeholderData: keepPreviousData,
    });
}

export function useFullTextSearch(uploadId: string, query: string) {
    return useQuery({
        queryKey: queryKeys.fts.search(uploadId, query),
        queryFn: ({ signal }) => fullTextSearch(uploadId, query, signal),
        enabled: !!uploadId && query.trim().length > 0,
        staleTime: STALE_SEARCH,
        placeholderData: keepPreviousData,
    });
}

export function usePreferences() {
    return useQuery({
        queryKey: queryKeys.preferences.all,
        queryFn: getPreferences,
        staleTime: STALE_REFERENCE,
    });
}

export function useReadingProgress(uploadId?: string) {
    return useQuery({
        queryKey: queryKeys.readingProgress.byUpload(uploadId!),
        queryFn: () => getReadingProgress(uploadId!),
        enabled: !!uploadId,
    });
}

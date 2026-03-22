import { keepPreviousData, useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getPeople, getPublications, getFirstPage, getPageByNumber, getPages, getPageUrl, getTags, getTopics, getUploads, getUpload, getHighlights, getHighlightsForPage, getBookmarks, getNotes, getNodes, getNodeById, getEdges, getEdgeById, getGraphData, getWritingProjects, getWritingProject, getWorkspaceMaterials, getChats, getChat, getMessages, getCollections, getCollection, fullTextSearch, getPreferences, getReadingProgress, getSummaryBySourcePage, getSummaryBySourceUpload, getSidebarChats, getChatContexts } from "./api";
import type { UploadFilters } from "./api";
import type { NodesTypeOptions } from "../pocketbase-types";
import { queryKeys } from "./queryKeys";

export function usePeople() {
    return useQuery({
        queryKey: queryKeys.people.all,
        queryFn: getPeople,
        placeholderData: keepPreviousData,
    });
}

export function usePublications() {
    return useQuery({
        queryKey: queryKeys.publications.all,
        queryFn: getPublications,
        placeholderData: keepPreviousData,
    });
}

export function useTags() {
    return useQuery({
        queryKey: queryKeys.tags.all,
        queryFn: getTags,
        placeholderData: keepPreviousData,
    });
}

export function useTopics() {
    return useQuery({
        queryKey: queryKeys.topics.all,
        queryFn: getTopics,
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
        placeholderData: keepPreviousData,
    });
}

export function useFirstPage(uploadId: string) {
    return useQuery({
        queryKey: queryKeys.pages.first(uploadId),
        queryFn: () => getFirstPage(uploadId),
        placeholderData: keepPreviousData,
    });
}

export function usePageByNumber(uploadId: string, pageNumber: number) {
    return useQuery({
        queryKey: queryKeys.pages.byNumber(uploadId, pageNumber),
        queryFn: () => getPageByNumber(uploadId, pageNumber),
        placeholderData: keepPreviousData,
    });
}

export function usePageMarkdown(pageId: string) {
    return useQuery({
        queryKey: queryKeys.pages.markdown(pageId),
        queryFn: async () => {
            const url = await getPageUrl(pageId);
            if (!url) return null;
            const response = await fetch(url);
            return await response.text();
        },
        placeholderData: keepPreviousData,
    });
}

export function usePages(uploadId: string, page: number = 1, perPage: number = 20) {
    return useQuery({
        queryKey: queryKeys.pages.list(uploadId, page, perPage),
        queryFn: () => getPages(uploadId, page, perPage),
        placeholderData: keepPreviousData,
    });
}

export function useSummaryBySourcePage(pageId: string, options?: { pollUntilFound?: boolean }) {
    return useQuery({
        queryKey: queryKeys.summaries.bySourcePage(pageId),
        queryFn: () => getSummaryBySourcePage(pageId),
        refetchInterval: (query) => {
            if (!options?.pollUntilFound) return false;
            return query.state.data ? false : 2000;
        },
        placeholderData: keepPreviousData,
    });
}

export function useSummaryBySourceUpload(uploadId: string, options?: { pollUntilFound?: boolean }) {
    return useQuery({
        queryKey: queryKeys.summaries.bySourceUpload(uploadId),
        queryFn: () => getSummaryBySourceUpload(uploadId),
        refetchInterval: (query) => {
            if (!options?.pollUntilFound) return false;
            return query.state.data ? false : 2000;
        },
        placeholderData: keepPreviousData,
    });
}

export function useInfinitePages(uploadId: string, perPage: number = 5, initialPage: number = 1) {
    return useInfiniteQuery({
        queryKey: queryKeys.pages.infinite(uploadId, perPage, initialPage),
        queryFn: ({ pageParam }) => getPages(uploadId, pageParam, perPage),
        initialPageParam: initialPage,
        getNextPageParam: (lastPage) =>
            lastPage && lastPage.page != null && lastPage.totalPages != null && lastPage.page < lastPage.totalPages
                ? lastPage.page + 1
                : undefined,
    });
}

export function useHighlights(uploadId: string) {
    return useQuery({
        queryKey: queryKeys.highlights.byUpload(uploadId),
        queryFn: () => getHighlights(uploadId),
        placeholderData: keepPreviousData,
    });
}

export function usePageHighlights(pageId: string) {
    return useQuery({
        queryKey: queryKeys.highlights.byPage(pageId),
        queryFn: () => getHighlightsForPage(pageId),
        placeholderData: keepPreviousData,
    });
}

export function useBookmarks(uploadId: string) {
    return useQuery({
        queryKey: queryKeys.bookmarks.byUpload(uploadId),
        queryFn: () => getBookmarks(uploadId),
        placeholderData: keepPreviousData,
    });
}

export function useNotes(uploadId: string) {
    return useQuery({
        queryKey: queryKeys.notes.byUpload(uploadId),
        queryFn: () => getNotes(uploadId),
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
        placeholderData: keepPreviousData,
    });
}

export function useGraphData() {
    return useQuery({
        queryKey: queryKeys.graph.all,
        queryFn: getGraphData,
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

export function useWritingProject(id: string) {
    return useQuery({
        queryKey: queryKeys.writingProjects.detail(id),
        queryFn: () => getWritingProject(id),
        placeholderData: keepPreviousData,
    });
}

export function useWorkspaceMaterials() {
    return useQuery({
        queryKey: queryKeys.workspaceMaterials.all,
        queryFn: getWorkspaceMaterials,
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
        placeholderData: keepPreviousData,
    });
}

export function useChats(type: "chat" | "search") {
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
        placeholderData: keepPreviousData,
    });
}

export function useMessages(chatId: string) {
    return useQuery({
        queryKey: queryKeys.messages.byChat(chatId),
        queryFn: () => getMessages(chatId),
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

export function useChatContexts(chatId: string) {
    return useQuery({
        queryKey: queryKeys.chatContexts.byChat(chatId),
        queryFn: () => getChatContexts(chatId),
        placeholderData: keepPreviousData,
    });
}

export function useFullTextSearch(uploadId: string, query: string) {
    return useQuery({
        queryKey: queryKeys.fts.search(uploadId, query),
        queryFn: ({ signal }) => fullTextSearch(uploadId, query, signal),
        enabled: query.trim().length > 0,
        placeholderData: keepPreviousData,
    });
}

export function usePreferences() {
    return useQuery({
        queryKey: queryKeys.preferences.all,
        queryFn: getPreferences,
    });
}

export function useReadingProgress(uploadId: string) {
    return useQuery({
        queryKey: queryKeys.readingProgress.byUpload(uploadId),
        queryFn: () => getReadingProgress(uploadId),
    });
}

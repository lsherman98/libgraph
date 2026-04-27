import { keepPreviousData, useQuery, useInfiniteQuery, skipToken } from "@tanstack/react-query";
import { getPeople, getPublications, getFirstPage, getPageByNumber, getPage, getSummary, getPages, getPageUrl, getTags, getTopics, getUploads, getUploadsPage, getUpload, getTranscriptUploadForAudio, getHighlights, getHighlightsForPage, getBookmarks, getNotes, getNodes, getNodeById, getEdges, getEdgeById, getGraphData, getWritingProjects, getWritingProject, getWorkspaceMaterials, getChats, getChat, getMessages, getCollections, getCollection, fullTextSearch, getPreferences, getReadingProgress, getSidebarChats, getChatContexts } from "./api";
import type { UploadFilters, UploadPaginationOptions } from "./api";
import type { MessagesResponse, NodesTypeOptions } from "../pocketbase-types";
import { queryKeys } from "./queryKeys";

const CHAT_MESSAGE_POLL_INTERVAL_MS = 800;
const CHAT_MESSAGE_POLL_TIMEOUT_MS = 90000;

interface QueryEnableOptions {
    enabled?: boolean;
}

export function usePeople(options?: QueryEnableOptions) {
    const enabled = options?.enabled ?? true;

    return useQuery({
        queryKey: queryKeys.people.all,
        queryFn: enabled ? getPeople : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function usePublications(options?: QueryEnableOptions) {
    const enabled = options?.enabled ?? true;

    return useQuery({
        queryKey: queryKeys.publications.all,
        queryFn: enabled ? getPublications : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useTags(options?: QueryEnableOptions) {
    const enabled = options?.enabled ?? true;

    return useQuery({
        queryKey: queryKeys.tags.all,
        queryFn: enabled ? getTags : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useTopics(options?: QueryEnableOptions) {
    const enabled = options?.enabled ?? true;

    return useQuery({
        queryKey: queryKeys.topics.all,
        queryFn: enabled ? getTopics : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useUploads(filters?: UploadFilters, options?: QueryEnableOptions) {
    const enabled = options?.enabled ?? true;

    return useQuery({
        queryKey: queryKeys.uploads.list(filters),
        queryFn: enabled ? () => getUploads(filters) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function usePaginatedUploads(filters: UploadFilters | undefined, pagination: UploadPaginationOptions, options?: QueryEnableOptions) {
    const enabled = options?.enabled ?? true;

    return useQuery({
        queryKey: queryKeys.uploads.paginatedList(filters, pagination.page, pagination.perPage),
        queryFn: enabled ? () => getUploadsPage(filters, pagination) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useUploadById(id?: string) {
    return useQuery({
        queryKey: queryKeys.uploads.detail(id),
        queryFn: id ? () => getUpload(id) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useTranscriptUploadForAudio(audioUploadId?: string, options?: QueryEnableOptions) {
    const enabled = options?.enabled ?? true;

    return useQuery({
        queryKey: ["uploads", "transcript", audioUploadId],
        queryFn: enabled && audioUploadId ? () => getTranscriptUploadForAudio(audioUploadId) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useFirstPage(uploadId?: string) {
    return useQuery({
        queryKey: queryKeys.pages.first(uploadId),
        queryFn: uploadId ? () => getFirstPage(uploadId) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function usePageByNumber(uploadId?: string, pageNumber?: number) {
    return useQuery({
        queryKey: queryKeys.pages.byNumber(uploadId, pageNumber),
        queryFn: uploadId && pageNumber != null ? () => getPageByNumber(uploadId, pageNumber) : skipToken,
        placeholderData: keepPreviousData,
        staleTime: 60_000,
    });
}

export function usePage(pageId?: string, options?: { pollUntilSummary?: boolean }) {
    return useQuery({
        queryKey: queryKeys.pages.detail(pageId),
        queryFn: pageId ? () => getPage(pageId) : skipToken,
        refetchInterval: (query) => {
            if (!options?.pollUntilSummary) return false;
            const page = query.state.data as { summary?: string | null } | undefined;
            return page?.summary ? false : 2000;
        },
    });
}

export function useSummary(summaryId?: string, options?: { pollUntilUpload?: boolean }) {
    return useQuery({
        queryKey: queryKeys.summaries.detail(summaryId),
        queryFn: summaryId ? () => getSummary(summaryId) : skipToken,
        refetchInterval: (query) => {
            if (!options?.pollUntilUpload) return false;
            const summary = query.state.data as { summary_upload?: string | null } | undefined;
            return summary?.summary_upload ? false : 2000;
        },
    });
}

export function usePageMarkdown(pageId?: string) {
    return useQuery({
        queryKey: queryKeys.pages.markdown(pageId),
        queryFn: pageId
            ? async () => {
                const url = await getPageUrl(pageId);
                if (!url) return null;
                const response = await fetch(url);
                return await response.text();
            }
            : skipToken,
    });
}

export function usePages(uploadId?: string, page: number = 1, perPage: number = 20) {
    return useQuery({
        queryKey: queryKeys.pages.list(uploadId, page, perPage),
        queryFn: uploadId ? () => getPages(uploadId, page, perPage) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useInfinitePages(uploadId?: string, perPage: number = 5, initialPage: number = 1) {
    return useInfiniteQuery({
        queryKey: queryKeys.pages.infinite(uploadId, perPage, initialPage),
        queryFn: uploadId ? ({ pageParam }) => getPages(uploadId, pageParam, perPage) : skipToken,
        initialPageParam: initialPage,
        getNextPageParam: (lastPage) =>
            lastPage && lastPage.page != null && lastPage.totalPages != null && lastPage.page < lastPage.totalPages
                ? lastPage.page + 1
                : undefined,
    });
}

export function useHighlights(uploadId?: string) {
    return useQuery({
        queryKey: queryKeys.highlights.byUpload(uploadId),
        queryFn: uploadId ? () => getHighlights(uploadId) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function usePageHighlights(pageId?: string) {
    return useQuery({
        queryKey: queryKeys.highlights.byPage(pageId),
        queryFn: pageId ? () => getHighlightsForPage(pageId) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useBookmarks(uploadId?: string) {
    return useQuery({
        queryKey: queryKeys.bookmarks.byUpload(uploadId),
        queryFn: uploadId ? () => getBookmarks(uploadId) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useNotes(uploadId?: string) {
    return useQuery({
        queryKey: queryKeys.notes.byUpload(uploadId),
        queryFn: uploadId ? () => getNotes(uploadId) : skipToken,
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

export function useNode(id?: string) {
    return useQuery({
        queryKey: queryKeys.nodes.detail(id),
        queryFn: id ? () => getNodeById(id) : skipToken,
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

export function useEdge(id?: string) {
    return useQuery({
        queryKey: queryKeys.edges.detail(id),
        queryFn: id ? () => getEdgeById(id) : skipToken,
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

export function useWritingProjects(options?: QueryEnableOptions) {
    const enabled = options?.enabled ?? true;

    return useQuery({
        queryKey: queryKeys.writingProjects.list(),
        queryFn: enabled ? getWritingProjects : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useWritingProject(id?: string) {
    return useQuery({
        queryKey: queryKeys.writingProjects.detail(id),
        queryFn: id ? () => getWritingProject(id) : skipToken,
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

export function useCollections(options?: QueryEnableOptions) {
    const enabled = options?.enabled ?? true;

    return useQuery({
        queryKey: queryKeys.collections.list(),
        queryFn: enabled ? getCollections : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useCollection(id?: string) {
    return useQuery({
        queryKey: queryKeys.collections.detail(id),
        queryFn: id ? () => getCollection(id) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useChats(type?: "chat" | "search" | "fts") {
    return useQuery({
        queryKey: queryKeys.chats.list(type),
        queryFn: type ? () => getChats(type) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useChat(id?: string) {
    return useQuery({
        queryKey: queryKeys.chats.detail(id),
        queryFn: id ? () => getChat(id) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function useMessages(chatId?: string) {
    return useQuery({
        queryKey: queryKeys.messages.byChat(chatId),
        queryFn: chatId ? () => getMessages(chatId) : skipToken,
        placeholderData: keepPreviousData,
        refetchInterval: (query) => {
            const messages = query.state.data as MessagesResponse[] | undefined;
            if (!messages || messages.length === 0) return false;

            const lastMessage = messages[messages.length - 1];
            if (!lastMessage || lastMessage.role !== "user") return false;

            const createdAt = Date.parse(lastMessage.created);
            if (Number.isNaN(createdAt)) {
                return CHAT_MESSAGE_POLL_INTERVAL_MS;
            }

            const elapsedMs = Date.now() - createdAt;
            return elapsedMs < CHAT_MESSAGE_POLL_TIMEOUT_MS ? CHAT_MESSAGE_POLL_INTERVAL_MS : false;
        },
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
        queryFn: chatId ? () => getChatContexts(chatId) : skipToken,
    });
}

export function useFullTextSearch(uploadId?: string, query?: string) {
    const normalizedQuery = query?.trim() ?? "";

    return useQuery({
        queryKey: queryKeys.fts.search(uploadId, normalizedQuery),
        queryFn: uploadId && normalizedQuery.length > 0 ? ({ signal }) => fullTextSearch(uploadId, normalizedQuery, signal) : skipToken,
        placeholderData: keepPreviousData,
    });
}

export function usePreferences() {
    return useQuery({
        queryKey: queryKeys.preferences.all,
        queryFn: getPreferences,
    });
}

export function useReadingProgress(uploadId?: string) {
    return useQuery({
        queryKey: queryKeys.readingProgress.byUpload(uploadId),
        queryFn: uploadId ? () => getReadingProgress(uploadId) : skipToken,
    });
}

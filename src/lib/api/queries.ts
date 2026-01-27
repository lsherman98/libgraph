import { keepPreviousData, useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getAuthors, getFirstPage, getPages, getPageUrl, getTags, getTopics, getUploads, getHighlights, getHighlightsForPage, getBookmarks, getNotes, getNodes, getNodeById, getEdges, getEdgeById, getGraphData, getWritingProjects, getWritingProject, getWorkspaceMaterials } from "./api";

export function useAuthors() {
    return useQuery({
        queryKey: ["authors"],
        queryFn: getAuthors,
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

export function useFirstPage(uploadId: string | null) {
    return useQuery({
        queryKey: ["firstPage", uploadId],
        queryFn: () => uploadId ? getFirstPage(uploadId) : null,
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

export function usePageMarkdown(pageId: string | null) {
    return useQuery({
        queryKey: ["pageMarkdown", pageId],
        queryFn: async () => {
            if (!pageId) return null;
            const url = await getPageUrl(pageId);
            const response = await fetch(url);
            return await response.text();
        },
        enabled: !!pageId,
        placeholderData: keepPreviousData
    });
}

export function usePages(uploadId: string | null, page: number = 1, perPage: number = 20) {
    return useQuery({
        queryKey: ["pages", uploadId, page, perPage],
        queryFn: () => uploadId ? getPages(uploadId, page, perPage) : null,
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

export function useInfinitePages(uploadId: string | null, perPage: number = 5, initialPage: number = 1) {
    return useInfiniteQuery({
        queryKey: ["pages-infinite", uploadId, perPage, initialPage],
        queryFn: ({ pageParam }) => getPages(uploadId!, pageParam as number, perPage),
        initialPageParam: initialPage,
        getNextPageParam: (lastPage) => lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        enabled: !!uploadId
    });
}

// Highlights hooks
export function useHighlights(uploadId: string | null) {
    return useQuery({
        queryKey: ["highlights", uploadId],
        queryFn: () => uploadId ? getHighlights(uploadId) : [],
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

export function usePageHighlights(pageId: string | null) {
    return useQuery({
        queryKey: ["highlights", "page", pageId],
        queryFn: () => pageId ? getHighlightsForPage(pageId) : [],
        enabled: !!pageId,
        placeholderData: keepPreviousData
    });
}

// Bookmarks hooks
export function useBookmarks(uploadId: string | null) {
    return useQuery({
        queryKey: ["bookmarks", uploadId],
        queryFn: () => uploadId ? getBookmarks(uploadId) : [],
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

// Notes hooks
export function useNotes(uploadId: string | null) {
    return useQuery({
        queryKey: ["notes", uploadId],
        queryFn: () => uploadId ? getNotes(uploadId) : [],
        enabled: !!uploadId,
        placeholderData: keepPreviousData
    });
}

// Nodes hooks
export function useNodes(filters?: { type?: string; userId?: string }) {
    return useQuery({
        queryKey: ["nodes", filters],
        queryFn: () => getNodes(filters),
        placeholderData: keepPreviousData
    });
}

export function useNode(id: string | null) {
    return useQuery({
        queryKey: ["node", id],
        queryFn: () => id ? getNodeById(id) : null,
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

export function useEdge(id: string | null) {
    return useQuery({
        queryKey: ["edge", id],
        queryFn: () => id ? getEdgeById(id) : null,
        enabled: !!id,
        placeholderData: keepPreviousData
    });
}

// Graph data hook - returns all nodes and edges for visualization
export function useGraphData() {
    return useQuery({
        queryKey: ["graph"],
        queryFn: getGraphData,
        placeholderData: keepPreviousData
    });
}

// Writing Projects hooks
export function useWritingProjects() {
    return useQuery({
        queryKey: ["writingProjects"],
        queryFn: getWritingProjects,
        placeholderData: keepPreviousData
    });
}

export function useWritingProject(id: string | null) {
    return useQuery({
        queryKey: ["writingProject", id],
        queryFn: () => id ? getWritingProject(id) : null,
        enabled: !!id,
        placeholderData: keepPreviousData
    });
}

// Workspace materials hook - returns all uploads, highlights, bookmarks, notes for the writer workspace
export function useWorkspaceMaterials() {
    return useQuery({
        queryKey: ["workspaceMaterials"],
        queryFn: getWorkspaceMaterials,
        placeholderData: keepPreviousData
    });
}

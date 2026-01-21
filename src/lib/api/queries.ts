import { keepPreviousData, useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getAuthors, getFirstPage, getPages, getPageUrl, getTags, getTopics, getUploads } from "./api";

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

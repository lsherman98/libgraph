import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAuthors, getTags, getTopics } from "./api";

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

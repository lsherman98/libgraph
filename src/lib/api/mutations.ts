import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upload, createAuthor, createTag, createTopic } from "./api";
import { handleError } from "../utils";
import { Collections, type Create } from "../pocketbase-types";

export function useUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Uploads>) => upload(record),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["uploads"] });
        },
    })
}

export function useCreateAuthor() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Authors>) => createAuthor(record),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["authors"] });
        },
    })
}

export function useCreateTag() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Tags>) => createTag(record),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tags"] });
        },
    })
}

export function useCreateTopic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Topics>) => createTopic(record),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["topics"] });
        },
    })
}
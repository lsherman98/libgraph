import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upload, createAuthor, createTag, createTopic, createHighlight, updateHighlight, deleteHighlight, createBookmark, updateBookmark, deleteBookmark, createNote, updateNote, deleteNote, createNode, updateNode, deleteNode, createEdge, updateEdge, deleteEdge } from "./api";
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

// Highlights mutations
export function useCreateHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Highlights>) => createHighlight(record),
        onMutate: async (newHighlight) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: ["highlights", "page", newHighlight.page] });

            // Snapshot the previous value
            const previousHighlights = queryClient.getQueryData(["highlights", "page", newHighlight.page]);

            // Optimistically update to the new value
            queryClient.setQueryData(["highlights", "page", newHighlight.page], (old: any[]) => {
                const optimisticHighlight = {
                    collectionId: 'highlights',
                    collectionName: Collections.Highlights,
                    id: 'temp-' + Date.now(),
                    created: new Date().toISOString(),
                    updated: new Date().toISOString(),
                    ...newHighlight
                };
                return old ? [...old, optimisticHighlight] : [optimisticHighlight];
            });

            // Return a context object with the snapshotted value
            return { previousHighlights };
        },
        onError: (err, newHighlight, context) => {
            handleError(err);
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousHighlights) {
                queryClient.setQueryData(["highlights", "page", newHighlight.page], context.previousHighlights);
            }
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["highlights"] });
            queryClient.invalidateQueries({ queryKey: ["highlights", "page", data.page] });
        },
    });
}

export function useUpdateHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Create<Collections.Highlights>> }) =>
            updateHighlight(id, data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["highlights"] });
        },
    });
}

export function useDeleteHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteHighlight(id),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["highlights"] });
        },
    });
}

// Bookmarks mutations
export function useCreateBookmark() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Bookmarks>) => createBookmark(record),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
        },
    });
}

export function useUpdateBookmark() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Create<Collections.Bookmarks>> }) =>
            updateBookmark(id, data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
        },
    });
}

export function useDeleteBookmark() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteBookmark(id),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
        },
    });
}

// Notes mutations
export function useCreateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Notes>) => createNote(record),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notes"] });
        },
    });
}

export function useUpdateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Create<Collections.Notes>> }) =>
            updateNote(id, data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notes"] });
        },
    });
}

export function useDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteNote(id),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notes"] });
        },
    });
}

// Nodes mutations
export function useCreateNode() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Nodes>) => createNode(record),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["nodes"] });
            queryClient.invalidateQueries({ queryKey: ["graph"] });
        },
    });
}

export function useUpdateNode() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Create<Collections.Nodes>> }) =>
            updateNode(id, data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["nodes"] });
            queryClient.invalidateQueries({ queryKey: ["graph"] });
        },
    });
}

export function useDeleteNode() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteNode(id),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["nodes"] });
            queryClient.invalidateQueries({ queryKey: ["edges"] });
            queryClient.invalidateQueries({ queryKey: ["graph"] });
        },
    });
}

// Edges mutations
export function useCreateEdge() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Edges>) => createEdge(record),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["edges"] });
            queryClient.invalidateQueries({ queryKey: ["graph"] });
        },
    });
}

export function useUpdateEdge() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Create<Collections.Edges>> }) =>
            updateEdge(id, data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["edges"] });
            queryClient.invalidateQueries({ queryKey: ["graph"] });
        },
    });
}

export function useDeleteEdge() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteEdge(id),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["edges"] });
            queryClient.invalidateQueries({ queryKey: ["graph"] });
        },
    });
}
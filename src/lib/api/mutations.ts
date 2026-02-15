import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upload, createPerson, createPublication, createTag, createTopic, createHighlight, updateHighlight, deleteHighlight, createBookmark, updateBookmark, deleteBookmark, createNote, updateNote, deleteNote, createWritingProject, updateWritingProject, deleteWritingProject, createChat, updateChat, deleteChat, createMessage, updateUpload, deleteUpload, createCollection, updateCollection, deleteCollection, sendChatMessage } from "./api";
import { handleError } from "../utils";
import { Collections, type Update } from "../pocketbase-types";
import type { ChatFilters, LLMParameters, RetrievalParameters } from "../types";

export function useUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: upload,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["uploads"] });
        },
    })
}

export function useUpdateUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Uploads> }) =>
            updateUpload(id, data),
        onError: handleError,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["uploads"] });
            queryClient.invalidateQueries({ queryKey: ["upload", variables.id] });
            queryClient.invalidateQueries({ queryKey: ["graph"] });
        },
    })
}

export function useDeleteUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteUpload,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["uploads"] });
            queryClient.invalidateQueries({ queryKey: ["graph"] });
            queryClient.invalidateQueries({ queryKey: ["collections"] });
        },
    });
}

export function useCreatePerson() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createPerson,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["people"] });
        },
    })
}

export function useCreatePublication() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createPublication,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["publications"] });
        },
    })
}

export function useCreateTag() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createTag,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tags"] });
        },
    })
}

export function useCreateTopic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createTopic,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["topics"] });
        },
    })
}

export function useCreateHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createHighlight,
        onMutate: async (newHighlight) => {
            await queryClient.cancelQueries({ queryKey: ["highlights", "page", newHighlight.page] });
            const previousHighlights = queryClient.getQueryData(["highlights", "page", newHighlight.page]);

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

            return { previousHighlights };
        },
        onError: (err, newHighlight, context) => {
            handleError(err);
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
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Highlights> }) =>
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
        mutationFn: deleteHighlight,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["highlights"] });
        },
    });
}

export function useCreateBookmark() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createBookmark,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
        },
    });
}

export function useUpdateBookmark() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Bookmarks> }) =>
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
        mutationFn: deleteBookmark,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
        },
    });
}

export function useCreateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createNote,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notes"] });
        },
    });
}

export function useUpdateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Notes> }) =>
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
        mutationFn: deleteNote,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notes"] });
        },
    });
}

export function useCreateWritingProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createWritingProject,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["writingProjects"] });
        },
    });
}

export function useUpdateWritingProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.WritingProjects> }) =>
            updateWritingProject(id, data),
        onError: handleError,
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["writingProjects"] });
            queryClient.invalidateQueries({ queryKey: ["writingProject", variables.id] });
        },
    });
}

export function useDeleteWritingProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteWritingProject,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["writingProjects"] });
        },
    });
}

export function useCreateCollection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createCollection,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["collections"] });
        },
    });
}

export function useUpdateCollection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Collections> }) =>
            updateCollection(id, data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["collections"] });
        },
    });
}

export function useDeleteCollection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteCollection,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["collections"] });
        },
    });
}

export function useCreateChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createChat,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["chats"] });
        },
    });
}

export function useUpdateChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Chats> }) =>
            updateChat(id, data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["chats"] });
        },
    });
}

export function useDeleteChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteChat,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["chats"] });
        },
    });
}

export function useCreateMessage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createMessage,
        onError: handleError,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["messages", data.chat] });
        },
    });
}

interface SendChatMessageOptions {
    mode: "chat" | "search";
    filters: ChatFilters;
    llmParams: LLMParameters;
    retrievalParams: RetrievalParameters;
    activeChatId: string | undefined;
    setActiveChatId: (id: string) => void;
    setInput: (value: string) => void;
}

export function useSendChatMessage({
    mode,
    filters,
    llmParams,
    retrievalParams,
    activeChatId,
    setActiveChatId,
    setInput,
}: SendChatMessageOptions) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (message: string) => {
            return sendChatMessage(
                message,
                mode,
                activeChatId,
                filters,
                mode === "chat" ? llmParams : undefined,
                retrievalParams,
            );
        },
        onMutate: async (message) => {
            setInput("");

            if (activeChatId) {
                await queryClient.cancelQueries({ queryKey: ["messages", activeChatId] });
                const previousMessages = queryClient.getQueryData(["messages", activeChatId]);
                queryClient.setQueryData(["messages", activeChatId], (old: any[] | null) => [
                    ...(old || []),
                    {
                        id: "optimistic-user-" + Date.now(),
                        role: "user",
                        content: message,
                        created: new Date().toISOString(),
                    },
                    {
                        id: "optimistic-loading-" + Date.now(),
                        role: "assistant",
                        content: "",
                        isLoading: true,
                        created: new Date().toISOString(),
                    },
                ]);

                return { previousMessages, chatId: activeChatId };
            }

            return { previousMessages: null, chatId: null };
        },
        onSuccess: (data) => {
            if (!activeChatId) {
                setActiveChatId(data.chat_id);
            }

            queryClient.invalidateQueries({ queryKey: ["messages", data.chat_id] });
            queryClient.invalidateQueries({ queryKey: ["chats"] });
        },
        onError: (_error, _message, context) => {
            if (context?.chatId && context?.previousMessages) {
                queryClient.setQueryData(["messages", context.chatId], context.previousMessages);
            }
        },
    });
}
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upload, createPerson, createPublication, createTag, createTopic, createHighlight, updateHighlight, deleteHighlight, createBookmark, updateBookmark, deleteBookmark, createNote, updateNote, deleteNote, createWritingProject, updateWritingProject, deleteWritingProject, createChat, updateChat, deleteChat, createMessage, updateUpload, deleteUpload, createCollection, updateCollection, deleteCollection, sendChatMessage, summarizeUpload, summarizePages, upsertPreferences, upsertReadingProgress, addChatContext, removeChatContext, sendSidebarChatMessage } from "./api";
import { handleError } from "../utils";
import { Collections, type Create, type HighlightsRecord, type Update } from "../pocketbase-types";
import type { ChatFilters } from "../types";
import { queryKeys } from "./queryKeys";

export function useUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: upload,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.uploads.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
        },
    });
}

export function useUpdateUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Uploads> }) =>
            updateUpload(id, data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.uploads.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.graph.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
        },
    });
}

export function useDeleteUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteUpload,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.uploads.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.graph.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
        },
    });
}

export function useCreatePerson() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createPerson,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
        },
    });
}

export function useCreatePublication() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createPublication,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.publications.all });
        },
    });
}

export function useCreateTag() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createTag,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
        },
    });
}

export function useCreateTopic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createTopic,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
        },
    });
}

export function useCreateHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createHighlight,
        onMutate: async (newHighlight) => {
            const pageKey = queryKeys.highlights.byPage(newHighlight.page as string);
            await queryClient.cancelQueries({ queryKey: pageKey });
            const previousHighlights = queryClient.getQueryData<HighlightsRecord[]>(pageKey);

            queryClient.setQueryData(pageKey, (old: HighlightsRecord[] | undefined) => {
                const previous = Array.isArray(old) ? old : [];
                return [...previous, newHighlight as HighlightsRecord];
            });

            return { previousHighlights, pageKey };
        },
        onError: (error, _variables, context) => {
            if (context?.pageKey) {
                queryClient.setQueryData(context.pageKey, context.previousHighlights ?? []);
            }
            handleError(error);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.highlights.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
        },
    });
}

export function useUpdateHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Highlights> }) =>
            updateHighlight(id, data),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.highlights.all });
            const previousHighlightQueries = queryClient.getQueriesData<HighlightsRecord[]>({
                queryKey: queryKeys.highlights.all,
            });

            queryClient.setQueriesData<HighlightsRecord[]>({ queryKey: queryKeys.highlights.all }, (old) => {
                if (!old) {
                    return old;
                }

                return old.map((highlight) =>
                    highlight.id === id ? { ...highlight, ...data } : highlight,
                );
            });

            return { previousHighlightQueries };
        },
        onError: (error, _variables, context) => {
            if (context?.previousHighlightQueries) {
                context.previousHighlightQueries.forEach(([queryKey, previousData]) => {
                    queryClient.setQueryData(queryKey, previousData);
                });
            }
            handleError(error);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.highlights.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
        },
    });
}

export function useDeleteHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteHighlight,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.highlights.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
        },
    });
}

export function useCreateBookmark() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createBookmark,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
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
            queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
        },
    });
}

export function useDeleteBookmark() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteBookmark,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
        },
    });
}

export function useCreateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createNote,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
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
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
        },
    });
}

export function useDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteNote,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
        },
    });
}

export function useCreateWritingProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createWritingProject,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.writingProjects.all });
        },
    });
}

export function useUpdateWritingProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.WritingProjects> }) =>
            updateWritingProject(id, data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.writingProjects.all });
        },
    });
}

export function useDeleteWritingProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteWritingProject,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.writingProjects.all });
        },
    });
}

export function useCreateCollection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createCollection,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
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
            queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
        },
    });
}

export function useDeleteCollection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteCollection,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
        },
    });
}

export function useCreateChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createChat,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
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
            queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
        },
    });
}

export function useDeleteChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteChat,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
        },
    });
}

export function useCreateMessage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createMessage,
        onError: handleError,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.messages.byChat(data.chat) });
        },
    });
}

interface SendChatMessageOptions {
    mode: "chat" | "search" | "fts" | "full_text";
    filters: ChatFilters;
    activeChatId: string | undefined;
    setActiveChatId: (id: string) => void;
    setInput: (value: string) => void;
    clearPendingMessages: () => void;
}

export function useSendChatMessage({
    mode,
    filters,
    activeChatId,
    setActiveChatId,
    setInput,
    clearPendingMessages,
}: SendChatMessageOptions) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ message, newChat }: { message: string; newChat?: boolean }) => {
            return sendChatMessage(
                message,
                mode,
                newChat ? undefined : activeChatId,
                filters,
            );
        },
        onMutate: async ({ message, newChat }) => {
            setInput("");
            const optimisticMessage = {
                id: "optimistic-user-" + Date.now(),
                role: "user" as const,
                content: message,
                created: new Date().toISOString(),
            };

            const effectiveChatId = newChat ? undefined : activeChatId;

            if (effectiveChatId) {
                const messagesKey = queryKeys.messages.byChat(effectiveChatId);
                await queryClient.cancelQueries({ queryKey: messagesKey });
                const previousMessages = queryClient.getQueryData(messagesKey);
                queryClient.setQueryData(messagesKey, (old: any[] | null) => [
                    ...(old || []),
                    optimisticMessage,
                ]);

                return { previousMessages, chatId: effectiveChatId, optimisticMessage };
            }

            return { previousMessages: null, chatId: null, optimisticMessage };
        },
        onSuccess: (data, { newChat }, context) => {
            const shouldSwitchChat = newChat || !activeChatId || activeChatId !== data.chat_id;

            if (shouldSwitchChat) {
                queryClient.setQueryData(queryKeys.messages.byChat(data.chat_id), (old: any[] | undefined) => {
                    if (Array.isArray(old) && old.length > 0) {
                        return old;
                    }

                    return context?.optimisticMessage ? [context.optimisticMessage] : [];
                });
                setActiveChatId(data.chat_id);
                clearPendingMessages();
            }

            queryClient.invalidateQueries({ queryKey: queryKeys.messages.byChat(data.chat_id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
        },
        onError: (_error, _message, context) => {
            if (context?.chatId && context?.previousMessages) {
                queryClient.setQueryData(
                    queryKeys.messages.byChat(context.chatId),
                    context.previousMessages,
                );
            }

            if (!context?.chatId) {
                clearPendingMessages();
            }
        },
    });
}

export function useUpdatePreferences() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: Create<Collections.Preferences>) =>
            upsertPreferences(data),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.preferences.all });
        },
    });
}

export function useUpdateReadingProgress() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ uploadId, data }: { uploadId: string; data: { current_page?: number; scroll_position?: number } }) =>
            upsertReadingProgress(uploadId, data),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.readingProgress.byUpload(variables.uploadId) });
        },
    });
}

export function useSummarizeUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: summarizeUpload,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.pages.all });
        },
    });
}

export function useSummarizePages() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: summarizePages,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.pages.all });
        },
    });
}

export function useAddChatContext() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: addChatContext,
        onError: handleError,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.chatContexts.byChat(data.chat) });
        },
    });
}

export function useRemoveChatContext() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id }: { id: string; chatId: string }) => removeChatContext(id),
        onError: handleError,
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.chatContexts.byChat(variables.chatId) });
        },
    });
}

export function useCreateSidebarChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createChat,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sidebarChats.all });
        },
    });
}

export function useDeleteSidebarChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteChat,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sidebarChats.all });
        },
    });
}

interface SendSidebarMessageOptions {
    activeChatId: string | undefined;
    setActiveChatId: (id: string) => void;
    setInput: (value: string) => void;
}

interface SendSidebarMessagePayload {
    message: string;
    chatId?: string;
}

export function useSendSidebarMessage({
    activeChatId,
    setActiveChatId,
    setInput,
}: SendSidebarMessageOptions) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ message, chatId }: SendSidebarMessagePayload) => {
            return sendSidebarChatMessage(message, chatId ?? activeChatId);
        },
        onMutate: async ({ message, chatId }) => {
            setInput("");

            const effectiveChatId = chatId ?? activeChatId;

            if (effectiveChatId) {
                const messagesKey = queryKeys.messages.byChat(effectiveChatId);
                await queryClient.cancelQueries({ queryKey: messagesKey });
                const previousMessages = queryClient.getQueryData(messagesKey);
                queryClient.setQueryData(messagesKey, (old: any[] | null) => [
                    ...(old || []),
                    {
                        id: "optimistic-user-" + Date.now(),
                        role: "user",
                        content: message,
                        created: new Date().toISOString(),
                    },
                ]);

                return { previousMessages, chatId: effectiveChatId };
            }

            return { previousMessages: null, chatId: null };
        },
        onSuccess: (data, { chatId }) => {
            if (!(chatId ?? activeChatId)) {
                setActiveChatId(data.chat_id);
            }

            queryClient.invalidateQueries({ queryKey: queryKeys.messages.byChat(data.chat_id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.sidebarChats.all });
        },
        onError: (_error, _message, context) => {
            if (context?.chatId && context?.previousMessages) {
                queryClient.setQueryData(
                    queryKeys.messages.byChat(context.chatId),
                    context.previousMessages,
                );
            }
        },
    });
}

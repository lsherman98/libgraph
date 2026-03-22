import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upload, createPerson, createPublication, createTag, createTopic, createHighlight, updateHighlight, deleteHighlight, createBookmark, updateBookmark, deleteBookmark, createNote, updateNote, deleteNote, createWritingProject, updateWritingProject, deleteWritingProject, createChat, updateChat, deleteChat, createMessage, updateUpload, deleteUpload, createCollection, updateCollection, deleteCollection, sendChatMessage, summarizePage, summarizePages, upsertPreferences, upsertReadingProgress, addChatContext, removeChatContext, sendSidebarChatMessage } from "./api";
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
            const previousHighlights = queryClient.getQueryData(pageKey);

            queryClient.setQueryData(pageKey, (old: HighlightsRecord[]) => {
                return [...old, newHighlight];
            });

            return { previousHighlights, pageKey };
        },
        onError: handleError,
        onSuccess: (_data, newHighlight) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.highlights.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
            if (newHighlight.upload) {
                queryClient.invalidateQueries({ queryKey: queryKeys.highlights.byUpload(newHighlight.upload as string) });
            }
        },
    });
}

export function useUpdateHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Highlights> }) =>
            updateHighlight(id, data),
        onError: handleError,
        onSuccess: (updatedHighlight) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.highlights.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
            if (updatedHighlight?.upload) {
                queryClient.invalidateQueries({ queryKey: queryKeys.highlights.byUpload(updatedHighlight.upload) });
            }
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
        onSuccess: (bookmark) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
            if (bookmark.upload) {
                queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.byUpload(bookmark.upload) });
            }
        },
    });
}

export function useUpdateBookmark() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Bookmarks> }) =>
            updateBookmark(id, data),
        onError: handleError,
        onSuccess: (bookmark) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
            if (bookmark.upload) {
                queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.byUpload(bookmark.upload) });
            }
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
        onSuccess: (newNote) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
            if (newNote.upload) {
                queryClient.invalidateQueries({ queryKey: queryKeys.notes.byUpload(newNote.upload) });
            }
        },
    });
}

export function useUpdateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Update<Collections.Notes> }) =>
            updateNote(id, data),
        onError: handleError,
        onSuccess: (note) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMaterials.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
            if (note.upload) {
                queryClient.invalidateQueries({ queryKey: queryKeys.notes.byUpload(note.upload) });
            }
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
    mode: "chat" | "search";
    filters: ChatFilters;
    activeChatId: string | undefined;
    setActiveChatId: (id: string) => void;
    setInput: (value: string) => void;
}

export function useSendChatMessage({
    mode,
    filters,
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
            );
        },
        onMutate: async (message) => {
            setInput("");

            if (activeChatId) {
                const messagesKey = queryKeys.messages.byChat(activeChatId);
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

export function useSummarizePage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: summarizePage,
        onError: handleError,
        onSuccess: (_data, pageId) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.pages.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.summaries.bySourcePage(pageId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.summaries.all });
        },
    });
}

export function useSummarizePages() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: summarizePages,
        onError: handleError,
        onSuccess: (_data, pageIds) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.pages.all });
            for (const pageId of pageIds) {
                queryClient.invalidateQueries({ queryKey: queryKeys.summaries.bySourcePage(pageId) });
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.summaries.all });
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
        mutationFn: removeChatContext,
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.chatContexts.all });
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

export function useSendSidebarMessage({
    activeChatId,
    setActiveChatId,
    setInput,
}: SendSidebarMessageOptions) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (message: string) => {
            return sendSidebarChatMessage(message, activeChatId);
        },
        onMutate: async (message) => {
            setInput("");

            if (activeChatId) {
                const messagesKey = queryKeys.messages.byChat(activeChatId);
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

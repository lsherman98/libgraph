import { pb } from "../pocketbase"
import { Collections, NodesTypeOptions, type Create, type EdgesResponse, type SummariesResponse, type Update } from "../pocketbase-types"
import type { ChatFilters, ChatResponseData, EnrichedNodesResponse, FTSSearchResult } from "../types"
import { getUserId } from "../utils"

export interface PageSummaryQueuedResponseData {
    status: string;
    page_id: string;
    dedupe_key: string;
}

export interface PageSummaryQueuedData {
    status: string;
    pageId: string;
    dedupeKey: string;
}

export async function getPageUrl(id?: string) {
    if (!id) return null;
    const [record, token] = await Promise.all([
        pb.collection(Collections.Pages).getOne(id),
        pb.files.getToken()
    ]);

    return pb.files.getURL(record, record.markdown, { "token": token });
}

export const upload = async (upload: Create<Collections.Uploads>) => {
    return await pb.collection(Collections.Uploads).create(upload)
}

export const getUpload = async (id: string) => {
    return await pb.collection(Collections.Uploads).getOne(id, {
        expand: 'people,publication,topic,tags,uploads'
    })
}

export const updateUpload = async (id: string, data: Update<Collections.Uploads>) => {
    return await pb.collection(Collections.Uploads).update(id, data)
}

export const deleteUpload = async (id: string) => {
    return await pb.collection(Collections.Uploads).delete(id)
}

export const getPeople = async () => {
    return await pb.collection(Collections.People).getFullList({ sort: 'name' })
}

export const createPerson = async (data: Create<Collections.People>) => {
    return await pb.collection(Collections.People).create(data)
}

export const getPublications = async () => {
    return await pb.collection(Collections.Publications).getFullList({ sort: 'name' })
}

export const createPublication = async (data: Create<Collections.Publications>) => {
    return await pb.collection(Collections.Publications).create(data)
}

export const getTags = async () => {
    return await pb.collection(Collections.Tags).getFullList({ sort: 'title' })
}

export const createTag = async (data: Create<Collections.Tags>) => {
    return await pb.collection(Collections.Tags).create(data)
}

export const getTopics = async () => {
    return await pb.collection(Collections.Topics).getFullList({ sort: 'title' })
}

export const createTopic = async (data: Create<Collections.Topics>) => {
    return await pb.collection(Collections.Topics).create(data)
}

export interface UploadFilters {
    search?: string;
    type?: string[];
    status?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    tags?: string[];
    topics?: string[];
    people?: string[];
    publication?: string;
}

export const getUploads = async (filters?: UploadFilters) => {
    const filterParts: string[] = ['type != "summary"'];

    if (filters?.type && filters.type.length > 0) {
        const typeFilters = filters.type.map(t => `type = "${t}"`).join(' || ');
        filterParts.push(`(${typeFilters})`);
    }

    if (filters?.status && filters.status.length > 0) {
        const statusFilters = filters.status.map(s => `status = "${s}"`).join(' || ');
        filterParts.push(`(${statusFilters})`);
    }

    if (filters?.tags && filters.tags.length > 0) {
        const tagFilters = filters.tags.map(t => `tags ?~ "${t}"`).join(' || ');
        filterParts.push(`(${tagFilters})`);
    }

    if (filters?.topics && filters.topics.length > 0) {
        const topicFilters = filters.topics.map(t => `topic ?~ "${t}"`).join(' || ');
        filterParts.push(`(${topicFilters})`);
    }

    if (filters?.people && filters.people.length > 0) {
        const peopleFilters = filters.people.map(p => `people ?~ "${p}"`).join(' || ');
        filterParts.push(`(${peopleFilters})`);
    }

    if (filters?.publication) {
        filterParts.push(`publication = "${filters.publication}"`);
    }

    if (filters?.search && filters.search.trim()) {
        filterParts.push(`(title ~ "${filters.search.trim()}" || file ~ "${filters.search.trim()}")`);
    }

    const sort = filters?.sortBy
        ? `${filters.sortOrder === 'asc' ? '+' : '-'}${filters.sortBy}`
        : '-created';

    return await pb.collection(Collections.Uploads).getFullList({
        sort,
        filter: filterParts.length > 0 ? filterParts.join(' && ') : undefined,
        expand: 'people,publication,topic,tags,uploads'
    })
}

export const searchUploadsFTS = async (query: string): Promise<any[]> => {
    if (!query.trim()) return [];
    const params = new URLSearchParams({ search: query });
    const result = await pb.send(
        `/api/collections/uploads/records/full-text-search?${params.toString()}`,
        { method: 'GET' }
    );
    if (!result) return [];
    return Array.isArray(result) ? result : [];
}

export const getFirstPage = async (uploadId: string) => {
    return await pb.collection(Collections.Pages).getFirstListItem(`upload = "${uploadId}" && page = 1`);
}

export const getPageByNumber = async (uploadId: string, pageNumber: number) => {
    return await pb.collection(Collections.Pages).getFirstListItem(`upload = "${uploadId}" && page = ${pageNumber}`);
}

export const getPages = async (uploadId?: string, page = 1, perPage = 10) => {
    if (!uploadId) return null;
    return await pb.collection(Collections.Pages).getList(page, perPage, {
        filter: `upload = "${uploadId}"`,
        sort: 'page'
    });
}

export const summarizePage = async (pageId: string) => {
    const response = await pb.send<PageSummaryQueuedResponseData>(`/api/pages/${pageId}/summarize`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': pb.authStore.token,
        },
    });

    return {
        status: response.status,
        pageId: response.page_id,
        dedupeKey: response.dedupe_key,
    } satisfies PageSummaryQueuedData;
}

export const getSummaryBySourcePage = async (pageId?: string): Promise<SummariesResponse | null> => {
    if (!pageId) return null;

    try {
        return await pb.collection(Collections.Summaries).getFirstListItem(`source_page = "${pageId}"`, {
            sort: '-updated',
        });
    } catch (_err) {
        return null;
    }
}

export const getSummaryBySourceUpload = async (uploadId?: string): Promise<SummariesResponse | null> => {
    if (!uploadId) return null;

    try {
        return await pb.collection(Collections.Summaries).getFirstListItem(`source_upload = "${uploadId}"`, {
            sort: '-updated',
        });
    } catch (_err) {
        return null;
    }
}

export const getHighlights = async (uploadId?: string) => {
    if (!uploadId) return null;
    return await pb.collection(Collections.Highlights).getFullList({
        filter: `upload = "${uploadId}"`,
        sort: 'created'
    });
}

export const getHighlightsForPage = async (pageId: string) => {
    return await pb.collection(Collections.Highlights).getFullList({
        filter: `page = "${pageId}"`,
        sort: 'start_offset'
    });
}

export const createHighlight = async (data: Create<Collections.Highlights>) => {
    return await pb.collection(Collections.Highlights).create(data);
}

export const updateHighlight = async (id: string, data: Update<Collections.Highlights>) => {
    return await pb.collection(Collections.Highlights).update(id, data);
}

export const deleteHighlight = async (id: string) => {
    return await pb.collection(Collections.Highlights).delete(id);
}

export const getBookmarks = async (uploadId?: string) => {
    if (!uploadId) return null;
    return await pb.collection(Collections.Bookmarks).getFullList({
        filter: `upload = "${uploadId}"`,
        sort: 'page_number'
    });
}

export const createBookmark = async (data: Create<Collections.Bookmarks>) => {
    return await pb.collection(Collections.Bookmarks).create(data);
}

export const updateBookmark = async (id: string, data: Update<Collections.Bookmarks>) => {
    return await pb.collection(Collections.Bookmarks).update(id, data);
}

export const deleteBookmark = async (id: string) => {
    return await pb.collection(Collections.Bookmarks).delete(id);
}

export const getNotes = async (uploadId?: string) => {
    if (!uploadId) return null;
    return await pb.collection(Collections.Notes).getFullList({
        filter: `upload = "${uploadId}"`,
        sort: 'page_number'
    });
}

export const createNote = async (data: Create<Collections.Notes>) => {
    return await pb.collection(Collections.Notes).create(data);
}

export const updateNote = async (id: string, data: Update<Collections.Notes>) => {
    return await pb.collection(Collections.Notes).update(id, data);
}

export const deleteNote = async (id: string) => {
    return await pb.collection(Collections.Notes).delete(id);
}

export const getNodes = async (type?: NodesTypeOptions) => {
    let filterStr = '';
    if (type) {
        filterStr = `type = "${type}"`;
    }

    return await pb.collection(Collections.Nodes).getFullList({
        filter: filterStr,
        sort: '-created'
    });
}

export const getNodeById = async (id: string) => {
    return await pb.collection(Collections.Nodes).getOne(id);
}

export const getNodeByRecord = async (recordId: string, type: NodesTypeOptions) => {
    return await pb.collection(Collections.Nodes).getFirstListItem(`record = "${recordId}" && type = "${type}"`);
}

export const getEdges = async (filters?: { sourceId?: string; targetId?: string; type?: string }) => {
    const filterParts: string[] = [];
    if (filters?.sourceId) {
        filterParts.push(`source = "${filters.sourceId}"`);
    }
    if (filters?.targetId) {
        filterParts.push(`target = "${filters.targetId}"`);
    }
    if (filters?.type) {
        filterParts.push(`type = "${filters.type}"`);
    }

    return await pb.collection(Collections.Edges).getFullList({
        filter: filterParts.length > 0 ? filterParts.join(' && ') : undefined,
        sort: '-created',
        expand: 'source,target'
    });
}

export const getEdgeById = async (id: string) => {
    return await pb.collection(Collections.Edges).getOne(id, {
        expand: 'source,target'
    });
}

export const getGraphData = async (): Promise<{ nodes: EnrichedNodesResponse[]; edges: EdgesResponse[] }> => {
    const [nodes, edges] = await Promise.all([
        pb.collection(Collections.Nodes).getFullList({
            sort: '-created'
        }),
        pb.collection(Collections.Edges).getFullList({
            sort: '-created',
            expand: 'source,target'
        })
    ]);

    return { nodes: nodes as EnrichedNodesResponse[], edges: edges as EdgesResponse[] };
}

export const getWritingProjects = async () => {
    return await pb.collection(Collections.WritingProjects).getFullList({
        sort: '-updated',
        expand: 'tags,topics'
    });
}

export const getWritingProject = async (id?: string) => {
    if (!id) return null;
    return await pb.collection(Collections.WritingProjects).getOne(id, {
        expand: 'tags,topics,linked_uploads,linked_highlights,linked_bookmarks,linked_notes'
    });
}

export const createWritingProject = async (data: Create<Collections.WritingProjects>) => {
    return await pb.collection(Collections.WritingProjects).create(data);
}

export const updateWritingProject = async (id: string, data: Update<Collections.WritingProjects>) => {
    return await pb.collection(Collections.WritingProjects).update(id, data);
}

export const deleteWritingProject = async (id: string) => {
    return await pb.collection(Collections.WritingProjects).delete(id);
}

export const getWorkspaceMaterials = async () => {
    const [uploads, highlights, bookmarks, notes] = await Promise.all([
        pb.collection(Collections.Uploads).getFullList({
            sort: '-created',
            filter: 'type != "summary"',
            expand: 'subjects,publication,tags'
        }),
        pb.collection(Collections.Highlights).getFullList({
            sort: '-created',
            expand: 'upload,tags'
        }),
        pb.collection(Collections.Bookmarks).getFullList({
            sort: '-created',
            expand: 'upload,tags'
        }),
        pb.collection(Collections.Notes).getFullList({
            sort: '-created',
            expand: 'upload,tags'
        })
    ]);

    return { uploads, highlights, bookmarks, notes };
}

export const getCollections = async () => {
    return await pb.collection(Collections.Collections).getFullList({
        sort: '-updated',
        expand: 'uploads'
    });
}

export const getCollection = async (id: string) => {
    return await pb.collection(Collections.Collections).getOne(id, {
        expand: 'uploads'
    });
}

export const createCollection = async (data: Create<Collections.Collections>) => {
    return await pb.collection(Collections.Collections).create(data);
}

export const updateCollection = async (id: string, data: Update<Collections.Collections>) => {
    return await pb.collection(Collections.Collections).update(id, data);
}

export const deleteCollection = async (id: string) => {
    return await pb.collection(Collections.Collections).delete(id);
}

export const getChats = async (type?: "chat" | "search") => {
    return await pb.collection(Collections.Chats).getFullList({
        sort: '-updated',
        ...(type ? { filter: `type = "${type}"` } : {}),
    });
}

export const getChat = async (id: string) => {
    return await pb.collection(Collections.Chats).getOne(id);
}

export const createChat = async (data: Create<Collections.Chats>) => {
    return await pb.collection(Collections.Chats).create(data);
}

export const updateChat = async (id: string, data: Update<Collections.Chats>) => {
    return await pb.collection(Collections.Chats).update(id, data);
}

export const deleteChat = async (id: string) => {
    return await pb.collection(Collections.Chats).delete(id);
}

export const getMessages = async (chatId?: string) => {
    if (!chatId) return null;
    return await pb.collection(Collections.Messages).getFullList({
        filter: `chat = "${chatId}"`,
        sort: 'created'
    });
}

export const createMessage = async (data: Create<Collections.Messages>) => {
    return await pb.collection(Collections.Messages).create(data);
}

export const sendChatMessage = async (
    message: string,
    mode: "chat" | "search" = "chat",
    chatId?: string,
    filters?: ChatFilters,
) => {
    return await pb.send<ChatResponseData>(`/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': pb.authStore.token,
        },
        body: JSON.stringify({
            message,
            mode,
            chat_id: chatId,
            filters,
        }),
    });
}

export const fullTextSearch = async (uploadId: string, query: string, signal?: AbortSignal): Promise<FTSSearchResult[]> => {
    if (!query.trim()) return [];

    const params = new URLSearchParams({
        search: query,
        upload: uploadId,
    });

    const result = await pb.send(
        `/api/collections/document_chunks/records/full-text-search?${params.toString()}`,
        {
            method: 'GET',
            signal,
        }
    );

    if (!result) return [];
    return Array.isArray(result) ? result : [];
}

export const getPreferences = async () => {
    try {
        return await pb.collection(Collections.Preferences).getFirstListItem("")
    } catch (error) { return null }
}

export const createPreferences = async (data: Create<Collections.Preferences>) => {
    return await pb.collection(Collections.Preferences).create(data);
}

export const updatePreferences = async (id: string, data: Update<Collections.Preferences>) => {
    return await pb.collection(Collections.Preferences).update(id, data);
}

export const upsertPreferences = async (data: Create<Collections.Preferences>) => {
    const userId = getUserId();
    if (!userId) {
        throw new Error("User must be authenticated to save preferences");
    }

    const existing = await getPreferences();
    if (existing) {
        return await updatePreferences(existing.id, data);
    }

    try {
        return await createPreferences({ ...data, user: userId });
    } catch (error) {
        const fallbackExisting = await pb.collection(Collections.Preferences).getFirstListItem(
            `user = "${userId}"`
        );
        return await updatePreferences(fallbackExisting.id, data);
    }
}

export const getReadingProgress = async (uploadId: string) => {
    try {
        return await pb.collection(Collections.ReadingProgress).getFirstListItem(
            `upload = "${uploadId}"`
        );
    } catch (error) { return null; }
}

export const upsertReadingProgress = async (
    uploadId: string,
    data: { current_page?: number; scroll_position?: number }
) => {
    const userId = getUserId();
    if (!userId) {
        throw new Error("User must be authenticated to save reading progress");
    }

    const existing = await getReadingProgress(uploadId);
    if (existing) {
        return await pb.collection(Collections.ReadingProgress).update(existing.id, data);
    }

    try {
        return await pb.collection(Collections.ReadingProgress).create({
            ...data,
            upload: uploadId,
            user: userId,
        });
    } catch (error) {
        const fallbackExisting = await pb.collection(Collections.ReadingProgress).getFirstListItem(
            `user = "${userId}" && upload = "${uploadId}"`
        );
        return await pb.collection(Collections.ReadingProgress).update(fallbackExisting.id, data);
    }
}

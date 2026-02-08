import { pb } from "../pocketbase"
import { Collections, type Create, type EdgesResponse } from "../pocketbase-types"
import type { EnrichedNodesResponse } from "../types"

export async function getPageUrl(id: string) {
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
        expand: 'subjects,publication,topic,tags,upload'
    })
}

export const updateUpload = async (id: string, data: Partial<Create<Collections.Uploads>>) => {
    return await pb.collection(Collections.Uploads).update(id, data)
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

export const getUploads = async () => {
    return await pb.collection(Collections.Uploads).getFullList({
        sort: '-created',
        expand: 'subjects,publication,topic,tags,upload'
    })
}

export const getFirstPage = async (uploadId: string) => {
    const pages = await pb.collection(Collections.Pages).getList(1, 1, {
        filter: `upload = "${uploadId}" && page = 1`
    });
    return pages.items[0] || null;
}

export const getPages = async (uploadId: string, page = 1, perPage = 5) => {
    return await pb.collection(Collections.Pages).getList(page, perPage, {
        filter: `upload = "${uploadId}"`,
        sort: 'page'
    });
}

// Highlights API
export const getHighlights = async (uploadId: string) => {
    const userId = pb.authStore.record?.id;
    if (!userId) return [];
    return await pb.collection(Collections.Highlights).getFullList({
        filter: `upload = "${uploadId}" && user = "${userId}"`,
        sort: 'created'
    });
}

export const getHighlightsForPage = async (pageId: string) => {
    const userId = pb.authStore.record?.id;
    if (!userId) return [];
    return await pb.collection(Collections.Highlights).getFullList({
        filter: `page = "${pageId}" && user = "${userId}"`,
        sort: 'start_offset'
    });
}

export const createHighlight = async (data: Create<Collections.Highlights>) => {
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error("User not authenticated");
    return await pb.collection(Collections.Highlights).create({
        ...data,
        user: userId
    });
}

export const updateHighlight = async (id: string, data: Partial<Create<Collections.Highlights>>) => {
    return await pb.collection(Collections.Highlights).update(id, data);
}

export const deleteHighlight = async (id: string) => {
    return await pb.collection(Collections.Highlights).delete(id);
}

// Bookmarks API
export const getBookmarks = async (uploadId: string) => {
    const userId = pb.authStore.record?.id;
    if (!userId) return [];
    return await pb.collection(Collections.Bookmarks).getFullList({
        filter: `upload = "${uploadId}" && user = "${userId}"`,
        sort: 'page_number'
    });
}

export const createBookmark = async (data: Create<Collections.Bookmarks>) => {
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error("User not authenticated");
    return await pb.collection(Collections.Bookmarks).create({
        ...data,
        user: userId
    });
}

export const updateBookmark = async (id: string, data: Partial<Create<Collections.Bookmarks>>) => {
    return await pb.collection(Collections.Bookmarks).update(id, data);
}

export const deleteBookmark = async (id: string) => {
    return await pb.collection(Collections.Bookmarks).delete(id);
}

// Notes API
export const getNotes = async (uploadId: string) => {
    const userId = pb.authStore.record?.id;
    if (!userId) return [];
    return await pb.collection(Collections.Notes).getFullList({
        filter: `upload = "${uploadId}" && user = "${userId}"`,
        sort: 'page_number'
    });
}

export const createNote = async (data: Create<Collections.Notes>) => {
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error("User not authenticated");
    return await pb.collection(Collections.Notes).create({
        ...data,
        user: userId
    });
}

export const updateNote = async (id: string, data: Partial<Create<Collections.Notes>>) => {
    return await pb.collection(Collections.Notes).update(id, data);
}

export const deleteNote = async (id: string) => {
    return await pb.collection(Collections.Notes).delete(id);
}

// Nodes API
export const getNodes = async (filters?: { type?: string; userId?: string }) => {
    const userId = pb.authStore.record?.id;
    if (!userId) return [];

    let filterStr = `user=${userId}`;
    if (filters?.type) {
        filterStr += ` && type=${filters.type}`;
    }

    return await pb.collection(Collections.Nodes).getFullList({
        filter: filterStr,
        sort: '-created'
    });
}

export const getNodeById = async (id: string) => {
    return await pb.collection(Collections.Nodes).getOne(id);
}

export const getNodeByRecord = async (recordId: string, type: string) => {
    const userId = pb.authStore.record?.id;
    if (!userId) return null;

    const nodes = await pb.collection(Collections.Nodes).getList(1, 1, {
        filter: `record = "${recordId}" && type = "${type}" && user = "${userId}"`
    });
    return nodes.items[0] || null;
}

export const createNode = async (data: Create<Collections.Nodes>) => {
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error("User not authenticated");
    return await pb.collection(Collections.Nodes).create({
        ...data,
        user: userId
    });
}

export const updateNode = async (id: string, data: Partial<Create<Collections.Nodes>>) => {
    return await pb.collection(Collections.Nodes).update(id, data);
}

export const deleteNode = async (id: string) => {
    // First delete all edges connected to this node
    const edges = await pb.collection(Collections.Edges).getFullList({
        filter: `source = "${id}" || target = "${id}"`
    });

    for (const edge of edges) {
        await pb.collection(Collections.Edges).delete(edge.id);
    }

    return await pb.collection(Collections.Nodes).delete(id);
}

// Edges API
export const getEdges = async (filters?: { sourceId?: string; targetId?: string; type?: string }) => {
    const userId = pb.authStore.record?.id;
    if (!userId) return [];

    let filterStr = `user=${userId}`;
    if (filters?.sourceId) {
        filterStr += ` && source=${filters.sourceId}`;
    }
    if (filters?.targetId) {
        filterStr += ` && target=${filters.targetId}`;
    }
    if (filters?.type) {
        filterStr += ` && type=${filters.type}`;
    }

    return await pb.collection(Collections.Edges).getFullList({
        filter: filterStr,
        sort: '-created',
        expand: 'source,target'
    });
}

export const getEdgeById = async (id: string) => {
    return await pb.collection(Collections.Edges).getOne(id, {
        expand: 'source,target'
    });
}

export const createEdge = async (data: Create<Collections.Edges>) => {
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error("User not authenticated");
    return await pb.collection(Collections.Edges).create({
        ...data,
        user: userId
    });
}

export const updateEdge = async (id: string, data: Partial<Create<Collections.Edges>>) => {
    return await pb.collection(Collections.Edges).update(id, data);
}

export const deleteEdge = async (id: string) => {
    return await pb.collection(Collections.Edges).delete(id);
}

// Graph data for visualization - returns all nodes and edges for the current user
// The backend enriches each node with record_data based on its type and record id
export const getGraphData = async (): Promise<{ nodes: EnrichedNodesResponse[]; edges: EdgesResponse[] }> => {
    const userId = pb.authStore.record?.id;
    if (!userId) return { nodes: [], edges: [] };

    const [nodes, edges] = await Promise.all([
        pb.collection(Collections.Nodes).getFullList({
            filter: `user = "${userId}"`,
            sort: '-created'
        }),
        pb.collection(Collections.Edges).getFullList({
            filter: `user = "${userId}"`,
            sort: '-created',
            expand: 'source,target'
        })
    ]);

    // The PocketBase OnRecordEnrich hook automatically adds record_data to each node
    // by fetching the related record from the appropriate collection based on node.type
    return { nodes: nodes as EnrichedNodesResponse[], edges: edges as EdgesResponse[] };
}

// Writing Projects API
export const getWritingProjects = async () => {
    const userId = pb.authStore.record?.id;
    if (!userId) return [];
    return await pb.collection(Collections.WritingProjects).getFullList({
        filter: `user = "${userId}"`,
        sort: '-updated',
        expand: 'tags,topics'
    });
}

export const getWritingProject = async (id: string) => {
    return await pb.collection(Collections.WritingProjects).getOne(id, {
        expand: 'tags,topics,linked_uploads,linked_highlights,linked_bookmarks,linked_notes'
    });
}

export const createWritingProject = async (data: Create<Collections.WritingProjects>) => {
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error("User not authenticated");
    return await pb.collection(Collections.WritingProjects).create({
        ...data,
        user: userId
    });
}

export const updateWritingProject = async (id: string, data: Partial<Create<Collections.WritingProjects>>) => {
    return await pb.collection(Collections.WritingProjects).update(id, data);
}

export const deleteWritingProject = async (id: string) => {
    return await pb.collection(Collections.WritingProjects).delete(id);
}

// Get all user's research materials for the workspace
export const getWorkspaceMaterials = async () => {
    const userId = pb.authStore.record?.id;
    if (!userId) return { uploads: [], highlights: [], bookmarks: [], notes: [] };

    const [uploads, highlights, bookmarks, notes] = await Promise.all([
        pb.collection(Collections.Uploads).getFullList({
            filter: `user = "${userId}"`,
            sort: '-created',
            expand: 'subjects,publication,tags'
        }),
        pb.collection(Collections.Highlights).getFullList({
            filter: `user = "${userId}"`,
            sort: '-created',
            expand: 'upload,tags'
        }),
        pb.collection(Collections.Bookmarks).getFullList({
            filter: `user = "${userId}"`,
            sort: '-created',
            expand: 'upload,tags'
        }),
        pb.collection(Collections.Notes).getFullList({
            filter: `user = "${userId}"`,
            sort: '-created',
            expand: 'upload,tags'
        })
    ]);

    return { uploads, highlights, bookmarks, notes };
}

// Collections API
export const getCollections = async () => {
    const userId = pb.authStore.record?.id;
    if (!userId) return [];
    return await pb.collection(Collections.Collections).getFullList({
        filter: `user = "${userId}"`,
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
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error("User not authenticated");
    return await pb.collection(Collections.Collections).create({
        ...data,
        user: userId
    });
}

export const updateCollection = async (id: string, data: Partial<Create<Collections.Collections>>) => {
    return await pb.collection(Collections.Collections).update(id, data);
}

export const deleteCollection = async (id: string) => {
    return await pb.collection(Collections.Collections).delete(id);
}

// Chats API
export const getChats = async () => {
    const userId = pb.authStore.record?.id;
    if (!userId) return [];
    return await pb.collection(Collections.Chats).getFullList({
        filter: `user = "${userId}"`,
        sort: '-updated'
    });
}

export const getChat = async (id: string) => {
    return await pb.collection(Collections.Chats).getOne(id);
}

export const createChat = async (data: Create<Collections.Chats>) => {
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error("User not authenticated");
    return await pb.collection(Collections.Chats).create({
        ...data,
        user: userId
    });
}

export const updateChat = async (id: string, data: Partial<Create<Collections.Chats>>) => {
    return await pb.collection(Collections.Chats).update(id, data);
}

export const deleteChat = async (id: string) => {
    return await pb.collection(Collections.Chats).delete(id);
}

// Messages API
export const getMessages = async (chatId: string) => {
    return await pb.collection(Collections.Messages).getFullList({
        filter: `chat = "${chatId}"`,
        sort: 'created'
    });
}

export const createMessage = async (data: Create<Collections.Messages>) => {
    return await pb.collection(Collections.Messages).create(data);
}

// Chat API
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatFilters {
    tags?: string[];
    subjects?: string[];
    publications?: string[];
    types?: string[];
    topics?: string[];
    uploads?: string[];
    collections?: string[];
}

export interface ChatSource {
    upload_id?: string;
    title?: string;
    score?: number;
    text?: string;
    page_number?: number;
}

export interface ChatResponseData {
    message: string;
    sources?: ChatSource[];
}

export const sendChatMessage = async (
    message: string,
    mode: "chat" | "search" = "chat",
    filters?: ChatFilters,
    history?: ChatMessage[]
): Promise<ChatResponseData> => {
    const baseUrl = pb.baseURL.endsWith('/') ? pb.baseURL.slice(0, -1) : pb.baseURL;
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': pb.authStore.token,
        },
        body: JSON.stringify({
            message,
            mode,
            filters,
            history,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Chat request failed');
    }

    return response.json();
}

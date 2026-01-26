import { pb } from "../pocketbase"
import { Collections, type Create } from "../pocketbase-types"

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

export const getAuthors = async () => {
    return await pb.collection(Collections.Authors).getFullList({ sort: 'name' })
}

export const createAuthor = async (data: Create<Collections.Authors>) => {
    return await pb.collection(Collections.Authors).create(data)
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
        expand: 'author,topic,tags'
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
export const getGraphData = async () => {
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

    return { nodes, edges };
}

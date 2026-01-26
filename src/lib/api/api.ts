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

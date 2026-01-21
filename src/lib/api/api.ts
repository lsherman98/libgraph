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

export const getPages = async (uploadId: string, page = 1, perPage = 20) => {
    return await pb.collection(Collections.Pages).getList(page, perPage, {
        filter: `upload = "${uploadId}"`,
        sort: 'page'
    });
}

import { pb } from "../pocketbase"
import { Collections, type Create } from "../pocketbase-types"

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
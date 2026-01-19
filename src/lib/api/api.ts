import { pb } from "../pocketbase"
import { Collections, type Create } from "../pocketbase-types"

export const upload = async (upload: Create<Collections.Uploads>) => {
    return await pb.collection(Collections.Uploads).create(upload)
}
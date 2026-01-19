import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upload } from "./api";
import { handleError } from "../utils";
import type { Collections, Create } from "../pocketbase-types";

export function useUpload() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (record: Create<Collections.Uploads>) => upload(record),
        onError: handleError,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["uploads"] });
        },
    })
}
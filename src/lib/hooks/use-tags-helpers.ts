import { useState, useMemo } from "react";
import { useTags } from "@/lib/api/queries";
import { useCreateTag } from "@/lib/api/mutations";
import { getUserId } from "@/lib/utils";

export function useTagLabels(tagIds: string[]): string[] {
    const { data: allTags = [] } = useTags();

    return useMemo(
        () => tagIds.map((id) => allTags.find((t) => t.id === id)?.title).filter(Boolean) as string[],
        [tagIds, allTags],
    );
}

export function useEditorTagManagement(initialTags: string[] = []) {
    const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
    const { data: tags = [] } = useTags();
    const createTagMutation = useCreateTag();

    const tagOptions = useMemo(
        () => tags.map((t) => ({ label: t.title || t.id, value: t.id })),
        [tags],
    );

    const handleTagSelect = (tagId: string) => {
        setSelectedTags((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
    };

    const handleTagCreate = (title: string) => {
        createTagMutation.mutate(
            { title, user: getUserId() },
            {
                onSuccess: (newTag) => {
                    setSelectedTags((prev) => [...prev, newTag.id]);
                },
            },
        );
    };

    return {
        selectedTags,
        setSelectedTags,
        tagOptions,
        handleTagSelect,
        handleTagCreate,
    };
}

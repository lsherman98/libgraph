import { HighlightsColorOptions } from "@/lib/pocketbase-types";

export interface HighlightColorConfig {
    value: HighlightsColorOptions;
    bg: string;
    border: string;
    ring: string;
    label: string;
}

export const HIGHLIGHT_COLORS: HighlightColorConfig[] = [
    {
        value: HighlightsColorOptions.yellow,
        bg: "bg-yellow-300/70",
        border: "border-yellow-400",
        ring: "ring-yellow-400",
        label: "Yellow",
    },
    {
        value: HighlightsColorOptions.green,
        bg: "bg-green-300/70",
        border: "border-green-400",
        ring: "ring-green-400",
        label: "Green",
    },
    {
        value: HighlightsColorOptions.blue,
        bg: "bg-blue-300/70",
        border: "border-blue-400",
        ring: "ring-blue-400",
        label: "Blue",
    },
    {
        value: HighlightsColorOptions.pink,
        bg: "bg-pink-300/70",
        border: "border-pink-400",
        ring: "ring-pink-400",
        label: "Pink",
    },
    {
        value: HighlightsColorOptions.purple,
        bg: "bg-purple-300/70",
        border: "border-purple-400",
        ring: "ring-purple-400",
        label: "Purple",
    },
];

export const HIGHLIGHT_BAR_CLASSES: Record<HighlightsColorOptions, string> = {
    [HighlightsColorOptions.yellow]: "bg-yellow-400",
    [HighlightsColorOptions.green]: "bg-green-400",
    [HighlightsColorOptions.blue]: "bg-blue-400",
    [HighlightsColorOptions.pink]: "bg-pink-400",
    [HighlightsColorOptions.purple]: "bg-purple-400",
};

export const HIGHLIGHT_PREVIEW_CLASSES: Record<HighlightsColorOptions, string> = {
    [HighlightsColorOptions.yellow]: "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-200",
    [HighlightsColorOptions.green]: "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-200",
    [HighlightsColorOptions.blue]: "bg-blue-200 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200",
    [HighlightsColorOptions.pink]: "bg-pink-200 text-pink-900 dark:bg-pink-900/50 dark:text-pink-200",
    [HighlightsColorOptions.purple]: "bg-purple-200 text-purple-900 dark:bg-purple-900/50 dark:text-purple-200",
};

export function getHighlightColorClass(color: HighlightsColorOptions): string {
    const config = HIGHLIGHT_COLORS.find((c) => c.value === color);
    return config?.bg || "bg-yellow-300/70";
}

export function getHighlightColorConfig(color: HighlightsColorOptions): HighlightColorConfig {
    return HIGHLIGHT_COLORS.find((c) => c.value === color) || HIGHLIGHT_COLORS[0];
}

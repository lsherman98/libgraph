import type { ComponentType, SVGProps } from "react";
import {
    FileText,
    User,
    Tag,
    FolderOpen,
    Highlighter,
    Bookmark,
    MessageSquare,
} from "lucide-react";
import { EdgesTypeOptions, NodesTypeOptions, UploadsTypeOptions } from "@/lib/pocketbase-types";

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const nodeTypeConfig: Record<NodesTypeOptions, { icon: LucideIcon; color: string; darkColor: string; label: string }> = {
    [NodesTypeOptions.upload]: { icon: FileText, color: "#3b82f6", darkColor: "#60a5fa", label: "Uploads" },
    [NodesTypeOptions.author]: { icon: User, color: "#9333ea", darkColor: "#a855f7", label: "Authors" },
    [NodesTypeOptions.tag]: { icon: Tag, color: "#22c55e", darkColor: "#4ade80", label: "Tags" },
    [NodesTypeOptions.topic]: { icon: FolderOpen, color: "#f97316", darkColor: "#fb923c", label: "Topics" },
    [NodesTypeOptions.highlight]: { icon: Highlighter, color: "#eab308", darkColor: "#facc15", label: "Highlights" },
    [NodesTypeOptions.bookmark]: { icon: Bookmark, color: "#ef4444", darkColor: "#f87171", label: "Bookmarks" },
    [NodesTypeOptions.note]: { icon: MessageSquare, color: "#6366f1", darkColor: "#818cf8", label: "Notes" },
};

export const edgeTypeConfig: Record<EdgesTypeOptions, { color: string; label: string }> = {
    [EdgesTypeOptions.authored_by]: { color: "#9333ea", label: "Authored by" },
    [EdgesTypeOptions.tagged_with]: { color: "#22c55e", label: "Tagged with" },
    [EdgesTypeOptions.belongs_to]: { color: "#f97316", label: "Belongs to" },
    [EdgesTypeOptions.highlight_of]: { color: "#eab308", label: "Highlight of" },
    [EdgesTypeOptions.bookmark_of]: { color: "#ef4444", label: "Bookmark of" },
    [EdgesTypeOptions.note_of]: { color: "#6366f1", label: "Note of" },
    [EdgesTypeOptions.published_by]: { color: "#0ea5e9", label: "Published by" },
    [EdgesTypeOptions.about_person]: { color: "#d946ef", label: "About person" },
    [EdgesTypeOptions.links_to]: { color: "#14b8a6", label: "Links to" },
    [EdgesTypeOptions.summary_of]: { color: "#8b5cf6", label: "Summary of" },
};

export const uploadTypeConfig: Record<UploadsTypeOptions, { color: string; darkColor: string; icon: string; label: string }> = {
    [UploadsTypeOptions.book]: {
        color: "#2563eb",
        darkColor: "#60a5fa",
        label: "Book",
        icon: "M4 3h10a3 3 0 0 1 3 3v14H7a3 3 0 0 0-3 3z M7 6h7 M7 10h7 M7 14h5",
    },
    [UploadsTypeOptions.article]: {
        color: "#0ea5e9",
        darkColor: "#38bdf8",
        label: "Article",
        icon: "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5",
    },
    [UploadsTypeOptions.podcast]: {
        color: "#f97316",
        darkColor: "#fb923c",
        label: "Podcast",
        icon: "M12 18a4 4 0 0 0 4-4V10a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4z M12 18v3 M9 21h6",
    },
    [UploadsTypeOptions.lecture]: {
        color: "#10b981",
        darkColor: "#34d399",
        label: "Lecture",
        icon: "M3 6h18v12H3z M8 10h8 M8 14h5",
    },
    [UploadsTypeOptions.youtube]: {
        color: "#ef4444",
        darkColor: "#f87171",
        label: "YouTube",
        icon: "M10 9l5 3-5 3z M3 7.5C3 6.12 4.12 5 5.5 5h13C19.88 5 21 6.12 21 7.5v9c0 1.38-1.12 2.5-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z",
    },
    [UploadsTypeOptions.essay]: {
        color: "#14b8a6",
        darkColor: "#2dd4bf",
        label: "Essay",
        icon: "M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4",
    },
    [UploadsTypeOptions.summary]: {
        color: "#8b5cf6",
        darkColor: "#a78bfa",
        label: "Summary",
        icon: "M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h3",
    },
};

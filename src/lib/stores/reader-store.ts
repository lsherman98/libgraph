import { create } from "zustand";
import type { HighlightsColorOptions } from "@/lib/pocketbase-types";

export interface PendingHighlight {
    text: string;
    color: HighlightsColorOptions;
    pageId: string;
    startOffset: number;
    endOffset: number;
}

export interface EditingHighlight {
    id: string;
    text: string;
    color: HighlightsColorOptions;
    note?: string;
    tags?: string[];
    pageId: string;
}

export interface PendingBookmark {
    blockId: string;
    previewText: string;
    pageId: string;
    pageNumber: number;
}

export interface EditingBookmark {
    id: string;
    blockId: string;
    previewText: string;
    comment?: string;
    tags?: string[];
    pageId: string;
    pageNumber: number;
}

export interface PendingNote {
    blockId: string;
    previewText: string;
    pageId: string;
    pageNumber: number;
}

export interface EditingNote {
    id: string;
    blockId: string;
    previewText?: string;
    content?: string;
    tags?: string[];
    pageId: string;
    pageNumber: number;
}

export type EditorState =
    | { mode: "pending-highlight"; data: PendingHighlight }
    | { mode: "editing-highlight"; data: EditingHighlight }
    | { mode: "pending-bookmark"; data: PendingBookmark }
    | { mode: "editing-bookmark"; data: EditingBookmark }
    | { mode: "pending-note"; data: PendingNote }
    | { mode: "editing-note"; data: EditingNote };

interface ReaderStore {
    annotationTab: "highlights" | "bookmarks" | "notes" | "ai";
    setAnnotationTab: (tab: "highlights" | "bookmarks" | "notes" | "ai") => void;
    currentUploadId: string | null;
    setCurrentUploadId: (uploadId: string | null) => void;
    currentPageId: string | null;
    currentPageNumber: number | null;
    setCurrentPageState: (pageId?: string, pageNumber?: number) => void;
    navigateToPage: ((pageNumber: number, blockId?: string) => void) | null;
    setNavigateToPage: (fn: ((pageNumber: number, blockId?: string) => void) | null) => void;
    editorState: EditorState | null;
    setEditorState: (state: EditorState | null) => void;
    pendingChatText: string | null;
    setPendingChatText: (text: string | null) => void;
}

export const useReaderStore = create<ReaderStore>((set) => ({
    annotationTab: "ai",
    setAnnotationTab: (tab) => set({ annotationTab: tab }),
    currentUploadId: null,
    setCurrentUploadId: (uploadId) => set({ currentUploadId: uploadId }),
    currentPageId: null,
    currentPageNumber: null,
    setCurrentPageState: (pageId, pageNumber) => set({ currentPageId: pageId, currentPageNumber: pageNumber }),
    navigateToPage: null,
    setNavigateToPage: (fn) => set({ navigateToPage: fn }),
    editorState: null,
    setEditorState: (state) => set({ editorState: state }),
    pendingChatText: null,
    setPendingChatText: (text) => set({ pendingChatText: text }),
}));

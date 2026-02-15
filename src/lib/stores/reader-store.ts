import { create } from "zustand";
import type { HighlightsColorOptions } from "@/lib/pocketbase-types";

// Pending highlight is for new selections that haven't been saved yet
export interface PendingHighlight {
    text: string;
    color: HighlightsColorOptions;
    pageId: string;
    startOffset: number;
    endOffset: number;
}

// Editing highlight is for existing highlights being edited
export interface EditingHighlight {
    id: string;
    text: string;
    color: HighlightsColorOptions;
    note?: string;
    tags?: string[];
    pageId: string;
}

// Pending bookmark is for new bookmarks that haven't been saved yet
export interface PendingBookmark {
    blockId: string;
    previewText: string;
    pageId: string;
    pageNumber: number;
}

// Editing bookmark is for existing bookmarks being edited
export interface EditingBookmark {
    id: string;
    blockId: string;
    previewText: string;
    comment?: string;
    tags?: string[];
    pageId: string;
    pageNumber: number;
}

// Pending note is for new notes that haven't been saved yet
export interface PendingNote {
    blockId: string;
    previewText: string;
    pageId: string;
    pageNumber: number;
}

// Editing note is for existing notes being edited
export interface EditingNote {
    id: string;
    blockId: string;
    previewText?: string;
    content?: string;
    tags?: string[];
    pageId: string;
    pageNumber: number;
}

// Discriminated union for all editor states
export type EditorState =
    | { mode: "pending-highlight"; data: PendingHighlight }
    | { mode: "editing-highlight"; data: EditingHighlight }
    | { mode: "pending-bookmark"; data: PendingBookmark }
    | { mode: "editing-bookmark"; data: EditingBookmark }
    | { mode: "pending-note"; data: PendingNote }
    | { mode: "editing-note"; data: EditingNote };

interface ReaderStore {
    isReadingMode: boolean;
    setReadingMode: (value: boolean) => void;
    // Current upload/document state for annotations panel
    currentUploadId: string | null;
    setCurrentUploadId: (uploadId: string | null) => void;
    // Current page state for annotations panel
    currentPageId: string | null;
    currentPageNumber: number | null;
    setCurrentPageState: (pageId: string | null, pageNumber: number | null) => void;
    // Navigation callback for annotations panel
    navigateToPage: ((pageNumber: number, blockId?: string) => void) | null;
    setNavigateToPage: (fn: ((pageNumber: number, blockId?: string) => void) | null) => void;
    // Single editor state (mutually exclusive)
    editorState: EditorState | null;
    setEditorState: (state: EditorState | null) => void;
}

export const useReaderStore = create<ReaderStore>((set) => ({
    isReadingMode: false,
    setReadingMode: (value) => set({ isReadingMode: value }),
    currentUploadId: null,
    setCurrentUploadId: (uploadId) => set({ currentUploadId: uploadId }),
    currentPageId: null,
    currentPageNumber: null,
    setCurrentPageState: (pageId, pageNumber) => set({ currentPageId: pageId, currentPageNumber: pageNumber }),
    navigateToPage: null,
    setNavigateToPage: (fn) => set({ navigateToPage: fn }),
    editorState: null,
    setEditorState: (state) => set({ editorState: state }),
}));

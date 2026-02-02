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

// Type for the create highlight function
type CreateHighlightFn = (data: {
    color: HighlightsColorOptions;
    text: string;
    note?: string;
    tags?: string[];
    start_offset: number;
    end_offset: number;
}) => void;

// Type for the update highlight function
type UpdateHighlightFn = (id: string, data: { color?: HighlightsColorOptions; note?: string; tags?: string[] }) => void;

// Type for the delete highlight function
type DeleteHighlightFn = (id: string) => void;

// Type for the create bookmark function
type CreateBookmarkFn = (data: {
    block_id: string;
    comment: string;
    tags?: string[];
    preview_text: string;
}) => void;

// Type for the update bookmark function
type UpdateBookmarkFn = (id: string, data: { comment?: string; tags?: string[] }) => void;

// Type for the delete bookmark function
type DeleteBookmarkFn = (id: string) => void;

// Type for the create note function
type CreateNoteFn = (data: {
    block_id: string;
    content: string;
    tags?: string[];
}) => void;

// Type for the update note function
type UpdateNoteFn = (id: string, data: { content?: string; tags?: string[] }) => void;

// Type for the delete note function
type DeleteNoteFn = (id: string) => void;

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
    // Highlight editor state - for new highlights being created
    pendingHighlight: PendingHighlight | null;
    setPendingHighlight: (highlight: PendingHighlight | null) => void;
    // Highlight editor state - for existing highlights being edited
    editingHighlight: EditingHighlight | null;
    setEditingHighlight: (highlight: EditingHighlight | null) => void;
    // Bookmark editor state - for new bookmarks being created
    pendingBookmark: PendingBookmark | null;
    setPendingBookmark: (bookmark: PendingBookmark | null) => void;
    // Bookmark editor state - for existing bookmarks being edited
    editingBookmark: EditingBookmark | null;
    setEditingBookmark: (bookmark: EditingBookmark | null) => void;
    // Note editor state - for new notes being created
    pendingNote: PendingNote | null;
    setPendingNote: (note: PendingNote | null) => void;
    // Note editor state - for existing notes being edited
    editingNote: EditingNote | null;
    setEditingNote: (note: EditingNote | null) => void;
    // Stable function references for highlight operations
    createHighlightFn: CreateHighlightFn | null;
    setCreateHighlightFn: (fn: CreateHighlightFn | null) => void;
    updateHighlightFn: UpdateHighlightFn | null;
    setUpdateHighlightFn: (fn: UpdateHighlightFn | null) => void;
    deleteHighlightFn: DeleteHighlightFn | null;
    setDeleteHighlightFn: (fn: DeleteHighlightFn | null) => void;
    // Stable function references for bookmark operations
    createBookmarkFn: CreateBookmarkFn | null;
    setCreateBookmarkFn: (fn: CreateBookmarkFn | null) => void;
    updateBookmarkFn: UpdateBookmarkFn | null;
    setUpdateBookmarkFn: (fn: UpdateBookmarkFn | null) => void;
    deleteBookmarkFn: DeleteBookmarkFn | null;
    setDeleteBookmarkFn: (fn: DeleteBookmarkFn | null) => void;
    // Stable function references for note operations
    createNoteFn: CreateNoteFn | null;
    setCreateNoteFn: (fn: CreateNoteFn | null) => void;
    updateNoteFn: UpdateNoteFn | null;
    setUpdateNoteFn: (fn: UpdateNoteFn | null) => void;
    deleteNoteFn: DeleteNoteFn | null;
    setDeleteNoteFn: (fn: DeleteNoteFn | null) => void;
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
    // Highlight editor state
    pendingHighlight: null,
    setPendingHighlight: (highlight) => set({ pendingHighlight: highlight, editingHighlight: null, pendingBookmark: null, editingBookmark: null, pendingNote: null, editingNote: null }),
    editingHighlight: null,
    setEditingHighlight: (highlight) => set({ editingHighlight: highlight, pendingHighlight: null, pendingBookmark: null, editingBookmark: null, pendingNote: null, editingNote: null }),
    // Bookmark editor state
    pendingBookmark: null,
    setPendingBookmark: (bookmark) => set({ pendingBookmark: bookmark, editingBookmark: null, pendingHighlight: null, editingHighlight: null, pendingNote: null, editingNote: null }),
    editingBookmark: null,
    setEditingBookmark: (bookmark) => set({ editingBookmark: bookmark, pendingBookmark: null, pendingHighlight: null, editingHighlight: null, pendingNote: null, editingNote: null }),
    // Note editor state
    pendingNote: null,
    setPendingNote: (note) => set({ pendingNote: note, editingNote: null, pendingHighlight: null, editingHighlight: null, pendingBookmark: null, editingBookmark: null }),
    editingNote: null,
    setEditingNote: (note) => set({ editingNote: note, pendingNote: null, pendingHighlight: null, editingHighlight: null, pendingBookmark: null, editingBookmark: null }),
    // Stable function references for highlights
    createHighlightFn: null,
    setCreateHighlightFn: (fn) => set({ createHighlightFn: fn }),
    updateHighlightFn: null,
    setUpdateHighlightFn: (fn) => set({ updateHighlightFn: fn }),
    deleteHighlightFn: null,
    setDeleteHighlightFn: (fn) => set({ deleteHighlightFn: fn }),
    // Stable function references for bookmarks
    createBookmarkFn: null,
    setCreateBookmarkFn: (fn) => set({ createBookmarkFn: fn }),
    updateBookmarkFn: null,
    setUpdateBookmarkFn: (fn) => set({ updateBookmarkFn: fn }),
    deleteBookmarkFn: null,
    setDeleteBookmarkFn: (fn) => set({ deleteBookmarkFn: fn }),
    // Stable function references for notes
    createNoteFn: null,
    setCreateNoteFn: (fn) => set({ createNoteFn: fn }),
    updateNoteFn: null,
    setUpdateNoteFn: (fn) => set({ updateNoteFn: fn }),
    deleteNoteFn: null,
    setDeleteNoteFn: (fn) => set({ deleteNoteFn: fn }),
}));

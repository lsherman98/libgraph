import { create } from "zustand";

interface ReaderStore {
    isReadingMode: boolean;
    setReadingMode: (value: boolean) => void;
    // Current page state for annotations panel
    currentPageId: string | null;
    currentPageNumber: number | null;
    setCurrentPageState: (pageId: string | null, pageNumber: number | null) => void;
    // Navigation callback for annotations panel
    navigateToPage: ((pageNumber: number, blockId?: string) => void) | null;
    setNavigateToPage: (fn: ((pageNumber: number, blockId?: string) => void) | null) => void;
}

export const useReaderStore = create<ReaderStore>((set) => ({
    isReadingMode: false,
    setReadingMode: (value) => set({ isReadingMode: value }),
    currentPageId: null,
    currentPageNumber: null,
    setCurrentPageState: (pageId, pageNumber) => set({ currentPageId: pageId, currentPageNumber: pageNumber }),
    navigateToPage: null,
    setNavigateToPage: (fn) => set({ navigateToPage: fn }),
}));

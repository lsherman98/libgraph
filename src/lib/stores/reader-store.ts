import { create } from "zustand";

interface ReaderStore {
    isReadingMode: boolean;
    setReadingMode: (value: boolean) => void;
}

export const useReaderStore = create<ReaderStore>((set) => ({
    isReadingMode: false,
    setReadingMode: (value) => set({ isReadingMode: value }),
}));

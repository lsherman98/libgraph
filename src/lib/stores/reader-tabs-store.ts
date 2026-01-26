import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ReaderTab {
    id: string;
    uploadId: string;
    title: string;
    currentPage: number;
}

export type SplitMode = "none" | "horizontal";

interface ReaderTabsStore {
    // Tab state
    tabs: ReaderTab[];
    activeTabId: string | null;

    // Split view state
    splitMode: SplitMode;
    splitTabId: string | null; // The tab shown in the split pane

    // Panel sizes (percentages)
    panelSizes: number[];

    // Actions
    addTab: (uploadId: string, title: string) => string;
    removeTab: (tabId: string) => void;
    setActiveTab: (tabId: string) => void;
    updateTabPage: (tabId: string, page: number) => void;
    updateTabTitle: (tabId: string, title: string) => void;

    // Split view actions
    setSplitMode: (mode: SplitMode) => void;
    setSplitTab: (tabId: string | null) => void;
    setPanelSizes: (sizes: number[]) => void;
    openInSplit: (uploadId: string, title: string) => void;
    closeSplit: () => void;

    // Utilities
    getTab: (tabId: string) => ReaderTab | undefined;
    getTabByUploadId: (uploadId: string) => ReaderTab | undefined;
    reorderTabs: (fromIndex: number, toIndex: number) => void;
}

function generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useReaderTabsStore = create<ReaderTabsStore>()(
    persist(
        (set, get) => ({
            tabs: [],
            activeTabId: null,
            splitMode: "none",
            splitTabId: null,
            panelSizes: [50, 50],

            addTab: (uploadId: string, title: string) => {
                const state = get();
                const existingTab = state.getTabByUploadId(uploadId);
                if (existingTab) {
                    // Only update if not already the active tab
                    if (state.activeTabId !== existingTab.id) {
                        set({ activeTabId: existingTab.id });
                    }
                    return existingTab.id;
                }

                const newTab: ReaderTab = {
                    id: generateTabId(),
                    uploadId,
                    title,
                    currentPage: 1,
                };

                set((state) => ({
                    tabs: [...state.tabs, newTab],
                    activeTabId: newTab.id,
                }));

                return newTab.id;
            },

            removeTab: (tabId: string) => {
                const state = get();
                const tabIndex = state.tabs.findIndex((t) => t.id === tabId);

                if (tabIndex === -1) return;

                const newTabs = state.tabs.filter((t) => t.id !== tabId);
                let newActiveTabId = state.activeTabId;
                let newSplitTabId = state.splitTabId;

                // If closing the active tab, switch to adjacent tab
                if (state.activeTabId === tabId) {
                    if (newTabs.length > 0) {
                        const newIndex = Math.min(tabIndex, newTabs.length - 1);
                        newActiveTabId = newTabs[newIndex].id;
                    } else {
                        newActiveTabId = null;
                    }
                }

                // If closing the split tab, close split mode
                if (state.splitTabId === tabId) {
                    newSplitTabId = null;
                }

                set({
                    tabs: newTabs,
                    activeTabId: newActiveTabId,
                    splitTabId: newSplitTabId,
                    splitMode: newSplitTabId ? state.splitMode : "none",
                });
            },

            setActiveTab: (tabId: string) => {
                set({ activeTabId: tabId });
            },

            updateTabPage: (tabId: string, page: number) => {
                set((state) => ({
                    tabs: state.tabs.map((tab) =>
                        tab.id === tabId ? { ...tab, currentPage: page } : tab
                    ),
                }));
            },

            updateTabTitle: (tabId: string, title: string) => {
                set((state) => ({
                    tabs: state.tabs.map((tab) =>
                        tab.id === tabId ? { ...tab, title } : tab
                    ),
                }));
            },

            setSplitMode: (mode: SplitMode) => {
                const state = get();
                if (mode === "none") {
                    set({ splitMode: "none", splitTabId: null });
                } else {
                    // If enabling split mode without a split tab, use the next available tab
                    if (!state.splitTabId && state.tabs.length > 1) {
                        const otherTab = state.tabs.find((t) => t.id !== state.activeTabId);
                        set({ splitMode: mode, splitTabId: otherTab?.id ?? null });
                    } else {
                        set({ splitMode: mode });
                    }
                }
            },

            setSplitTab: (tabId: string | null) => {
                set({ splitTabId: tabId });
            },

            setPanelSizes: (sizes: number[]) => {
                set({ panelSizes: sizes });
            },

            openInSplit: (uploadId: string, title: string) => {
                const state = get();
                let tabId: string;

                // Check if tab already exists
                const existingTab = state.getTabByUploadId(uploadId);
                if (existingTab) {
                    tabId = existingTab.id;
                } else {
                    // Create new tab
                    const newTab: ReaderTab = {
                        id: generateTabId(),
                        uploadId,
                        title,
                        currentPage: 1,
                    };
                    set((s) => ({ tabs: [...s.tabs, newTab] }));
                    tabId = newTab.id;
                }

                // Open in split view
                set({
                    splitMode: state.splitMode === "none" ? "horizontal" : state.splitMode,
                    splitTabId: tabId,
                });
            },

            closeSplit: () => {
                set({ splitMode: "none", splitTabId: null });
            },

            getTab: (tabId: string) => {
                return get().tabs.find((t) => t.id === tabId);
            },

            getTabByUploadId: (uploadId: string) => {
                return get().tabs.find((t) => t.uploadId === uploadId);
            },

            reorderTabs: (fromIndex: number, toIndex: number) => {
                set((state) => {
                    const newTabs = [...state.tabs];
                    const [moved] = newTabs.splice(fromIndex, 1);
                    newTabs.splice(toIndex, 0, moved);
                    return { tabs: newTabs };
                });
            },
        }),
        {
            name: "reader-tabs-storage",
            partialize: (state) => ({
                tabs: state.tabs,
                activeTabId: state.activeTabId,
                splitMode: state.splitMode,
                splitTabId: state.splitTabId,
                panelSizes: state.panelSizes,
            }),
        }
    )
);

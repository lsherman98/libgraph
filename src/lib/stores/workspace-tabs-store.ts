import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BaseTab {
    id: string;
    title: string;
}

export interface ReaderTab extends BaseTab {
    type: "reader";
    uploadId: string;
    currentPage: number;
}

export interface WriterTab extends BaseTab {
    type: "writer";
    projectId: string;
    isDirty: boolean;
}

export type WorkspaceTab = ReaderTab | WriterTab;
export type SplitMode = "none" | "horizontal";

interface WorkspaceTabsStore {
    tabs: WorkspaceTab[];
    activeTabId: string | null;
    splitMode: SplitMode;
    splitTabId: string | null;
    panelSizes: number[];
    addReaderTab: (uploadId: string, title: string) => string;
    addWriterTab: (projectId: string, title: string) => string;
    removeTab: (tabId: string) => void;
    setActiveTab: (tabId: string) => void;
    updateTabTitle: (tabId: string, title: string) => void;
    updateReaderTabPage: (tabId: string, page: number) => void;
    setWriterTabDirty: (tabId: string, isDirty: boolean) => void;
    setSplitMode: (mode: SplitMode) => void;
    setPanelSizes: (sizes: number[]) => void;
    closeSplit: () => void;
    getTab: (tabId: string) => WorkspaceTab | undefined;
}

function generateTabId(type: "reader" | "writer"): string {
    return `${type}-tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useWorkspaceTabsStore = create<WorkspaceTabsStore>()(
    persist(
        (set, get) => ({
            tabs: [],
            activeTabId: null,
            splitMode: "none",
            splitTabId: null,
            panelSizes: [50, 50],

            addReaderTab: (uploadId: string, title: string) => {
                const state = get();
                const existingTab = state.tabs.find((t): t is ReaderTab => t.type === "reader" && t.uploadId === uploadId);
                if (existingTab) {
                    if (state.activeTabId !== existingTab.id) {
                        set({ activeTabId: existingTab.id });
                    }
                    return existingTab.id;
                }

                const newTab: ReaderTab = {
                    id: generateTabId("reader"),
                    type: "reader",
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

            addWriterTab: (projectId: string, title: string) => {
                const state = get();
                const existingTab = state.tabs.find((t): t is WriterTab => t.type === "writer" && t.projectId === projectId);
                if (existingTab) {
                    if (state.activeTabId !== existingTab.id) {
                        set({ activeTabId: existingTab.id });
                    }
                    return existingTab.id;
                }

                const newTab: WriterTab = {
                    id: generateTabId("writer"),
                    type: "writer",
                    projectId,
                    title,
                    isDirty: false,
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

                if (state.activeTabId === tabId) {
                    if (newTabs.length > 0) {
                        const newIndex = Math.min(tabIndex, newTabs.length - 1);
                        newActiveTabId = newTabs[newIndex].id;
                    } else {
                        newActiveTabId = null;
                    }
                }

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

            updateTabTitle: (tabId: string, title: string) => {
                set((state) => ({
                    tabs: state.tabs.map((tab) =>
                        tab.id === tabId ? { ...tab, title } : tab
                    ),
                }));
            },

            updateReaderTabPage: (tabId: string, page: number) => {
                set((state) => ({
                    tabs: state.tabs.map((tab) =>
                        tab.id === tabId && tab.type === "reader"
                            ? { ...tab, currentPage: page }
                            : tab
                    ),
                }));
            },

            setWriterTabDirty: (tabId: string, isDirty: boolean) => {
                set((state) => ({
                    tabs: state.tabs.map((tab) =>
                        tab.id === tabId && tab.type === "writer"
                            ? { ...tab, isDirty }
                            : tab
                    ),
                }));
            },

            setSplitMode: (mode: SplitMode) => {
                const state = get();
                if (mode === "none") {
                    set({ splitMode: "none", splitTabId: null });
                } else {
                    if (!state.splitTabId && state.tabs.length > 1) {
                        const otherTab = state.tabs.find((t) => t.id !== state.activeTabId);
                        set({ splitMode: mode, splitTabId: otherTab?.id ?? null });
                    } else {
                        set({ splitMode: mode });
                    }
                }
            },

            setPanelSizes: (sizes: number[]) => {
                set({ panelSizes: sizes });
            },

            closeSplit: () => {
                set({ splitMode: "none", splitTabId: null });
            },

            getTab: (tabId: string) => {
                return get().tabs.find((t) => t.id === tabId);
            },
        }),
        {
            name: "workspace-tabs-storage",
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

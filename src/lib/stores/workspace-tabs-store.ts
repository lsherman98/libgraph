import { create } from "zustand";
import { persist } from "zustand/middleware";

// Base tab interface with common properties
interface BaseTab {
    id: string;
    title: string;
}

// Reader tab extends base with reader-specific properties
export interface ReaderTab extends BaseTab {
    type: "reader";
    uploadId: string;
    currentPage: number;
}

// Writer tab extends base with writer-specific properties
export interface WriterTab extends BaseTab {
    type: "writer";
    projectId: string;
    isDirty: boolean;
}

// Union type for all tab types
export type WorkspaceTab = ReaderTab | WriterTab;

export type SplitMode = "none" | "horizontal";

interface WorkspaceTabsStore {
    // Tab state
    tabs: WorkspaceTab[];
    activeTabId: string | null;

    // Split view state
    splitMode: SplitMode;
    splitTabId: string | null;

    // Panel sizes (percentages)
    panelSizes: number[];

    // Workspace panel state (for writer tabs)
    workspacePanelOpen: boolean;
    workspacePanelSize: number[];

    // Tab actions
    addReaderTab: (uploadId: string, title: string) => string;
    addWriterTab: (projectId: string, title: string) => string;
    removeTab: (tabId: string) => void;
    setActiveTab: (tabId: string) => void;
    updateTabTitle: (tabId: string, title: string) => void;
    updateReaderTabPage: (tabId: string, page: number) => void;
    setWriterTabDirty: (tabId: string, isDirty: boolean) => void;

    // Split view actions
    setSplitMode: (mode: SplitMode) => void;
    setSplitTab: (tabId: string | null) => void;
    setPanelSizes: (sizes: number[]) => void;
    openInSplit: (tab: { type: "reader"; uploadId: string; title: string } | { type: "writer"; projectId: string; title: string }) => void;
    closeSplit: () => void;

    // Workspace panel actions
    toggleWorkspacePanel: () => void;
    setWorkspacePanelOpen: (open: boolean) => void;
    setWorkspacePanelSize: (sizes: number[]) => void;

    // Utilities
    getTab: (tabId: string) => WorkspaceTab | undefined;
    getReaderTab: (tabId: string) => ReaderTab | undefined;
    getWriterTab: (tabId: string) => WriterTab | undefined;
    getTabByUploadId: (uploadId: string) => ReaderTab | undefined;
    getTabByProjectId: (projectId: string) => WriterTab | undefined;
    reorderTabs: (fromIndex: number, toIndex: number) => void;

    // Filtered getters
    getReaderTabs: () => ReaderTab[];
    getWriterTabs: () => WriterTab[];
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
            workspacePanelOpen: true,
            workspacePanelSize: [70, 30],

            addReaderTab: (uploadId: string, title: string) => {
                const state = get();
                const existingTab = state.getTabByUploadId(uploadId);
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
                const existingTab = state.getTabByProjectId(projectId);
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

            openInSplit: (tabData) => {
                const state = get();
                let tabId: string;

                if (tabData.type === "reader") {
                    const existingTab = state.getTabByUploadId(tabData.uploadId);
                    if (existingTab) {
                        tabId = existingTab.id;
                    } else {
                        const newTab: ReaderTab = {
                            id: generateTabId("reader"),
                            type: "reader",
                            uploadId: tabData.uploadId,
                            title: tabData.title,
                            currentPage: 1,
                        };
                        set((s) => ({ tabs: [...s.tabs, newTab] }));
                        tabId = newTab.id;
                    }
                } else {
                    const existingTab = state.getTabByProjectId(tabData.projectId);
                    if (existingTab) {
                        tabId = existingTab.id;
                    } else {
                        const newTab: WriterTab = {
                            id: generateTabId("writer"),
                            type: "writer",
                            projectId: tabData.projectId,
                            title: tabData.title,
                            isDirty: false,
                        };
                        set((s) => ({ tabs: [...s.tabs, newTab] }));
                        tabId = newTab.id;
                    }
                }

                set({
                    splitMode: state.splitMode === "none" ? "horizontal" : state.splitMode,
                    splitTabId: tabId,
                });
            },

            closeSplit: () => {
                set({ splitMode: "none", splitTabId: null });
            },

            toggleWorkspacePanel: () => {
                set((state) => ({ workspacePanelOpen: !state.workspacePanelOpen }));
            },

            setWorkspacePanelOpen: (open: boolean) => {
                set({ workspacePanelOpen: open });
            },

            setWorkspacePanelSize: (sizes: number[]) => {
                set({ workspacePanelSize: sizes });
            },

            getTab: (tabId: string) => {
                return get().tabs.find((t) => t.id === tabId);
            },

            getReaderTab: (tabId: string) => {
                const tab = get().tabs.find((t) => t.id === tabId);
                return tab?.type === "reader" ? tab : undefined;
            },

            getWriterTab: (tabId: string) => {
                const tab = get().tabs.find((t) => t.id === tabId);
                return tab?.type === "writer" ? tab : undefined;
            },

            getTabByUploadId: (uploadId: string) => {
                return get().tabs.find((t): t is ReaderTab => t.type === "reader" && t.uploadId === uploadId);
            },

            getTabByProjectId: (projectId: string) => {
                return get().tabs.find((t): t is WriterTab => t.type === "writer" && t.projectId === projectId);
            },

            reorderTabs: (fromIndex: number, toIndex: number) => {
                set((state) => {
                    const newTabs = [...state.tabs];
                    const [moved] = newTabs.splice(fromIndex, 1);
                    newTabs.splice(toIndex, 0, moved);
                    return { tabs: newTabs };
                });
            },

            getReaderTabs: () => {
                return get().tabs.filter((t): t is ReaderTab => t.type === "reader");
            },

            getWriterTabs: () => {
                return get().tabs.filter((t): t is WriterTab => t.type === "writer");
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
                workspacePanelOpen: state.workspacePanelOpen,
                workspacePanelSize: state.workspacePanelSize,
            }),
        }
    )
);

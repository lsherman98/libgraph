import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WriterTab {
    id: string;
    projectId: string;
    title: string;
    isDirty: boolean; // Has unsaved changes
}

export type SplitMode = "none" | "horizontal";

interface WriterTabsStore {
    // Tab state
    tabs: WriterTab[];
    activeTabId: string | null;

    // Split view state
    splitMode: SplitMode;
    splitTabId: string | null;

    // Panel sizes (percentages)
    panelSizes: number[];

    // Workspace panel state
    workspacePanelOpen: boolean;
    workspacePanelSize: number[];

    // Actions
    addTab: (projectId: string, title: string) => string;
    removeTab: (tabId: string) => void;
    setActiveTab: (tabId: string) => void;
    updateTabTitle: (tabId: string, title: string) => void;
    setTabDirty: (tabId: string, isDirty: boolean) => void;

    // Split view actions
    setSplitMode: (mode: SplitMode) => void;
    setSplitTab: (tabId: string | null) => void;
    setPanelSizes: (sizes: number[]) => void;
    openInSplit: (projectId: string, title: string) => void;
    closeSplit: () => void;

    // Workspace panel actions
    toggleWorkspacePanel: () => void;
    setWorkspacePanelOpen: (open: boolean) => void;
    setWorkspacePanelSize: (sizes: number[]) => void;

    // Utilities
    getTab: (tabId: string) => WriterTab | undefined;
    getTabByProjectId: (projectId: string) => WriterTab | undefined;
    reorderTabs: (fromIndex: number, toIndex: number) => void;
}

function generateTabId(): string {
    return `writer-tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useWriterTabsStore = create<WriterTabsStore>()(
    persist(
        (set, get) => ({
            tabs: [],
            activeTabId: null,
            splitMode: "none",
            splitTabId: null,
            panelSizes: [50, 50],
            workspacePanelOpen: true,
            workspacePanelSize: [70, 30],

            addTab: (projectId: string, title: string) => {
                const state = get();
                const existingTab = state.getTabByProjectId(projectId);
                if (existingTab) {
                    if (state.activeTabId !== existingTab.id) {
                        set({ activeTabId: existingTab.id });
                    }
                    return existingTab.id;
                }

                const newTab: WriterTab = {
                    id: generateTabId(),
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

            setTabDirty: (tabId: string, isDirty: boolean) => {
                set((state) => ({
                    tabs: state.tabs.map((tab) =>
                        tab.id === tabId ? { ...tab, isDirty } : tab
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

            setSplitTab: (tabId: string | null) => {
                set({ splitTabId: tabId });
            },

            setPanelSizes: (sizes: number[]) => {
                set({ panelSizes: sizes });
            },

            openInSplit: (projectId: string, title: string) => {
                const state = get();
                let tabId: string;

                const existingTab = state.getTabByProjectId(projectId);
                if (existingTab) {
                    tabId = existingTab.id;
                } else {
                    const newTab: WriterTab = {
                        id: generateTabId(),
                        projectId,
                        title,
                        isDirty: false,
                    };
                    set((s) => ({ tabs: [...s.tabs, newTab] }));
                    tabId = newTab.id;
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

            getTabByProjectId: (projectId: string) => {
                return get().tabs.find((t) => t.projectId === projectId);
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
            name: "writer-tabs-storage",
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

import { create } from "zustand";

interface BaseTab {
    id: string;
    title: string;
}

export interface ReaderTab extends BaseTab {
    type: "reader";
    uploadId: string;
    currentPage: number;
    isSummary?: boolean;
    summarySourceTabId?: string;
    summarySourcePageId?: string;
}

export interface WriterTab extends BaseTab {
    type: "writer";
    projectId: string;
    isDirty: boolean;
}

export type WorkspaceTab = ReaderTab | WriterTab;
export type SplitMode = "none" | "horizontal";

export interface WorkspaceLayoutState {
    tabs: WorkspaceTab[];
    activeTabId: string | null;
    splitMode: SplitMode;
    splitTabId: string | null;
    focusedPane: "primary" | "secondary";
    panelSizes: number[];
}

interface WorkspaceTabsStore extends WorkspaceLayoutState {
    _hydrated: boolean;
    hydrate: (state: Partial<WorkspaceLayoutState>) => void;
    addReaderTab: (uploadId: string, title: string) => string;
    addWriterTab: (projectId: string, title: string) => string;
    removeTab: (tabId: string) => void;
    setActiveTab: (tabId: string) => void;
    setFocusedPane: (pane: "primary" | "secondary") => void;
    updateTabTitle: (tabId: string, title: string) => void;
    updateReaderTabPage: (tabId: string, page: number) => void;
    setWriterTabDirty: (tabId: string, isDirty: boolean) => void;
    setSplitMode: (mode: SplitMode) => void;
    setPanelSizes: (sizes: number[]) => void;
    closeSplit: () => void;
    openOrUpdateSummarySplitTab: (params: {
        sourceTabId: string;
        sourcePageId: string;
        summaryUploadId: string;
        title: string;
    }) => string;
    closeSummarySplitTab: (sourceTabId: string) => void;
    getSummarySplitTab: (sourceTabId: string) => ReaderTab | undefined;
    getTab: (tabId: string) => WorkspaceTab | undefined;
}

function generateTabId(type: "reader" | "writer"): string {
    return `${type}-tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useWorkspaceTabsStore = create<WorkspaceTabsStore>()(
    (set, get) => ({
        tabs: [],
        activeTabId: null,
        splitMode: "none",
        splitTabId: null,
        focusedPane: "primary",
        panelSizes: [50, 50],
        _hydrated: false,

        hydrate: (state: Partial<WorkspaceLayoutState>) => {
            set((current) => ({
                ...current,
                ...state,
                focusedPane: state.focusedPane ?? "primary",
                _hydrated: true,
            }));
        },
        addReaderTab: (uploadId: string, title: string) => {
            const state = get();
            const existingTab = state.tabs.find((t): t is ReaderTab => t.type === "reader" && t.uploadId === uploadId);
            if (existingTab) {
                get().setActiveTab(existingTab.id);
                return existingTab.id;
            }

            const newTab: ReaderTab = {
                id: generateTabId("reader"),
                type: "reader",
                uploadId,
                title,
                currentPage: 1,
            };

            set((state) => {
                if (state.splitMode === "horizontal" && state.splitTabId && state.focusedPane === "secondary") {
                    return {
                        tabs: [...state.tabs, newTab],
                        splitTabId: newTab.id,
                    };
                }

                return {
                    tabs: [...state.tabs, newTab],
                    activeTabId: newTab.id,
                    focusedPane: "primary",
                };
            });

            return newTab.id;
        },
        addWriterTab: (projectId: string, title: string) => {
            const state = get();
            const existingTab = state.tabs.find((t): t is WriterTab => t.type === "writer" && t.projectId === projectId);
            if (existingTab) {
                get().setActiveTab(existingTab.id);
                return existingTab.id;
            }

            const newTab: WriterTab = {
                id: generateTabId("writer"),
                type: "writer",
                projectId,
                title,
                isDirty: false,
            };

            set((state) => {
                if (state.splitMode === "horizontal" && state.splitTabId && state.focusedPane === "secondary") {
                    return {
                        tabs: [...state.tabs, newTab],
                        splitTabId: newTab.id,
                    };
                }

                return {
                    tabs: [...state.tabs, newTab],
                    activeTabId: newTab.id,
                    focusedPane: "primary",
                };
            });

            return newTab.id;
        },
        removeTab: (tabId: string) => {
            const state = get();
            const tabIndex = state.tabs.findIndex((t) => t.id === tabId);

            if (tabIndex === -1) return;

            const newTabs = state.tabs.filter((t) => t.id !== tabId);
            let newActiveTabId = state.activeTabId;
            let newSplitTabId = state.splitTabId;
            let newFocusedPane = state.focusedPane;

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
                newFocusedPane = "primary";
            }

            if (newActiveTabId && newSplitTabId && newActiveTabId === newSplitTabId) {
                newSplitTabId = null;
                newFocusedPane = "primary";
            }

            set({
                tabs: newTabs,
                activeTabId: newActiveTabId,
                splitTabId: newSplitTabId,
                focusedPane: newFocusedPane,
                splitMode: newSplitTabId ? state.splitMode : "none",
            });
        },
        setActiveTab: (tabId: string) => {
            const state = get();

            if (state.splitMode === "horizontal" && state.splitTabId) {
                if (tabId === state.activeTabId) {
                    set({ focusedPane: "primary" });
                    return;
                }

                if (tabId === state.splitTabId) {
                    set({ focusedPane: "secondary" });
                    return;
                }

                if (state.focusedPane === "secondary") {
                    set({ splitTabId: tabId, focusedPane: "secondary" });
                    return;
                }

                set({ activeTabId: tabId, focusedPane: "primary" });
                return;
            }

            set({ activeTabId: tabId, focusedPane: "primary" });
        },
        setFocusedPane: (pane: "primary" | "secondary") => {
            const state = get();
            if (pane === "secondary" && (state.splitMode !== "horizontal" || !state.splitTabId)) {
                set({ focusedPane: "primary" });
                return;
            }
            set({ focusedPane: pane });
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
                set({ splitMode: "none", splitTabId: null, focusedPane: "primary" });
            } else {
                if (!state.splitTabId && state.tabs.length > 1) {
                    const otherTab = state.tabs.find((t) => t.id !== state.activeTabId);
                    set({ splitMode: mode, splitTabId: otherTab?.id ?? null, focusedPane: "primary" });
                } else {
                    set({ splitMode: mode, focusedPane: "primary" });
                }
            }
        },
        setPanelSizes: (sizes: number[]) => {
            set({ panelSizes: sizes });
        },
        closeSplit: () => {
            set({ splitMode: "none", splitTabId: null, focusedPane: "primary" });
        },
        openOrUpdateSummarySplitTab: ({ sourceTabId, sourcePageId, summaryUploadId, title }) => {
            const state = get();
            const existingSummaryTab = state.tabs.find(
                (tab): tab is ReaderTab => tab.type === "reader" && !!tab.isSummary && tab.summarySourceTabId === sourceTabId,
            );

            if (existingSummaryTab) {
                set((prev) => ({
                    tabs: prev.tabs.map((tab) => {
                        if (tab.id !== existingSummaryTab.id || tab.type !== "reader") return tab;
                        return {
                            ...tab,
                            uploadId: summaryUploadId,
                            title,
                            currentPage: 1,
                            summarySourcePageId: sourcePageId,
                        };
                    }),
                    splitMode: "horizontal",
                    splitTabId: existingSummaryTab.id,
                    focusedPane: "primary",
                }));
                return existingSummaryTab.id;
            }

            const newTab: ReaderTab = {
                id: generateTabId("reader"),
                type: "reader",
                uploadId: summaryUploadId,
                title,
                currentPage: 1,
                isSummary: true,
                summarySourceTabId: sourceTabId,
                summarySourcePageId: sourcePageId,
            };

            set((prev) => ({
                tabs: [...prev.tabs, newTab],
                splitMode: "horizontal",
                splitTabId: newTab.id,
                focusedPane: "primary",
            }));

            return newTab.id;
        },
        closeSummarySplitTab: (sourceTabId: string) => {
            const state = get();
            const summaryTab = state.tabs.find(
                (tab): tab is ReaderTab => tab.type === "reader" && !!tab.isSummary && tab.summarySourceTabId === sourceTabId,
            );

            if (!summaryTab) {
                return;
            }

            const nextTabs = state.tabs.filter((tab) => tab.id !== summaryTab.id);
            const wasSplitTab = state.splitTabId === summaryTab.id;

            set({
                tabs: nextTabs,
                splitTabId: wasSplitTab ? null : state.splitTabId,
                focusedPane: wasSplitTab ? "primary" : state.focusedPane,
                splitMode: wasSplitTab ? "none" : state.splitMode,
            });
        },
        getSummarySplitTab: (sourceTabId: string) => {
            return get().tabs.find(
                (tab): tab is ReaderTab => tab.type === "reader" && !!tab.isSummary && tab.summarySourceTabId === sourceTabId,
            );
        },
        getTab: (tabId: string) => {
            return get().tabs.find((t) => t.id === tabId);
        },
    }),
);

export function getWorkspaceLayoutSnapshot(): WorkspaceLayoutState {
    const { tabs, activeTabId, splitMode, splitTabId, focusedPane, panelSizes } = useWorkspaceTabsStore.getState();
    return { tabs, activeTabId, splitMode, splitTabId, focusedPane, panelSizes };
}

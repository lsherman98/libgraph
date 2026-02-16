import { useEffect, useRef } from "react";
import { usePreferences } from "@/lib/api/queries";
import { useUpdatePreferences } from "@/lib/api/mutations";
import {
    useWorkspaceTabsStore,
    getWorkspaceLayoutSnapshot,
    type WorkspaceLayoutState,
} from "@/lib/stores/workspace-tabs-store";

export function useWorkspaceTabsSync() {
    const { data: preferences, isSuccess } = usePreferences();
    const updatePreferences = useUpdatePreferences();
    const hydrate = useWorkspaceTabsStore((s) => s.hydrate);
    const isHydrated = useWorkspaceTabsStore((s) => s._hydrated);

    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updatePrefsRef = useRef(updatePreferences);
    updatePrefsRef.current = updatePreferences;

    useEffect(() => {
        if (isSuccess && !isHydrated) {
            if (preferences?.workspace_layout) {
                const layout = preferences.workspace_layout as Partial<WorkspaceLayoutState>;
                hydrate(layout);
            } else {
                hydrate({});
            }
        }
    }, [isSuccess, isHydrated, preferences?.id, hydrate]);

    useEffect(() => {
        if (!isHydrated) return;

        const unsub = useWorkspaceTabsStore.subscribe(() => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
                const snapshot = getWorkspaceLayoutSnapshot();
                updatePrefsRef.current.mutate({
                    workspace_layout: JSON.stringify(snapshot),
                });
            }, 2000);
        });

        return () => {
            unsub();
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [isHydrated]);
}

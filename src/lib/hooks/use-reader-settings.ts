import { useState, useEffect, useCallback, useRef } from "react";
import { usePreferences, useReadingProgress } from "@/lib/api/queries";
import { useUpdatePreferences, useUpdateReadingProgress } from "@/lib/api/mutations";
import { getUserId } from "../utils";

export const FONT_FAMILIES = {
    system: { name: "System", value: "system-ui, -apple-system, sans-serif" },
    serif: { name: "Serif", value: "Georgia, 'Times New Roman', serif" },
    sans: { name: "Sans Serif", value: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    mono: { name: "Monospace", value: "'JetBrains Mono', 'Fira Code', monospace" },
    openDyslexic: { name: "OpenDyslexic", value: "'OpenDyslexic', sans-serif" },
} as const;

export type FontFamilyKey = keyof typeof FONT_FAMILIES;

export const READER_THEMES = {
    light: {
        name: "Light",
        backgroundColor: "#ffffff",
        textColor: "#1a1a1a",
        accentColor: "#3b82f6",
    },
    sepia: {
        name: "Sepia",
        backgroundColor: "#f4ecd8",
        textColor: "#5c4b37",
        accentColor: "#8b6914",
    },
    paper: {
        name: "Paper",
        backgroundColor: "#fffef9",
        textColor: "#333333",
        accentColor: "#2563eb",
    },
} as const;

export type ReaderThemeKey = keyof typeof READER_THEMES;

export interface ReaderSettings {
    fontSize: number;
    fontFamily: FontFamilyKey;
    lineHeight: number;
    letterSpacing: number;
    textAlign: "left" | "justify" | "center";
    theme: ReaderThemeKey | "custom";
    backgroundColor: string;
    textColor: string;
    viewMode: "scroll" | "paginate";
    hyphenation: boolean;
    paragraphSpacing: number;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
    fontSize: 18,
    fontFamily: "serif",
    lineHeight: 1.8,
    letterSpacing: 0,
    textAlign: "left",
    theme: "light",
    backgroundColor: READER_THEMES.light.backgroundColor,
    textColor: READER_THEMES.light.textColor,
    viewMode: "paginate",
    hyphenation: false,
    paragraphSpacing: 2.5,
};

function parseReaderSettings(value: unknown): Partial<ReaderSettings> | null {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === "object" && parsed !== null ? (parsed as Partial<ReaderSettings>) : null;
        } catch {
            return null;
        }
    }

    return typeof value === "object" ? (value as Partial<ReaderSettings>) : null;
}

export function useReaderSettings() {
    const { data: preferences, isSuccess } = usePreferences();
    const updatePreferences = useUpdatePreferences();

    const [settings, setSettingsState] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);
    const [isLoaded, setIsLoaded] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    const flushSave = useCallback((nextSettings: ReaderSettings) => {
        const userId = getUserId();
        if (!userId) {
            return;
        }

        updatePreferences.mutate({
            reader_settings: nextSettings,
            user: userId,
        });
    }, [updatePreferences]);

    useEffect(() => {
        if (isSuccess) {
            const dbSettings = parseReaderSettings(preferences?.reader_settings);

            if (dbSettings) {
                setSettingsState((prev) => ({ ...prev, ...dbSettings }));
            }

            setIsLoaded(true);
        }
    }, [isSuccess, preferences?.reader_settings]);

    const scheduleSave = useCallback((newSettings: ReaderSettings) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            flushSave(newSettings);
        }, 1000);
    }, [flushSave]);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
                flushSave(settingsRef.current);
            }
        };
    }, [flushSave]);

    const setSettings = useCallback((newSettings: Partial<ReaderSettings>) => {
        setSettingsState((prev) => {
            const updated = { ...prev, ...newSettings };
            scheduleSave(updated);
            return updated;
        });
    }, [scheduleSave]);

    const applyTheme = useCallback((themeKey: ReaderThemeKey) => {
        const theme = READER_THEMES[themeKey];
        setSettingsState((prev) => {
            const updated = {
                ...prev,
                theme: themeKey,
                backgroundColor: theme.backgroundColor,
                textColor: theme.textColor,
            };
            scheduleSave(updated);
            return updated;
        });
    }, [scheduleSave]);

    const resetSettings = useCallback(() => {
        setSettingsState(DEFAULT_READER_SETTINGS);
        scheduleSave(DEFAULT_READER_SETTINGS);
    }, [scheduleSave]);

    const cssVariables = {
        "--reader-font-size": `${settings.fontSize}px`,
        "--reader-font-family": FONT_FAMILIES[settings.fontFamily].value,
        "--reader-line-height": settings.lineHeight,
        "--reader-letter-spacing": `${settings.letterSpacing}em`,
        "--reader-text-align": settings.textAlign,
        "--reader-bg-color": settings.backgroundColor,
        "--reader-text-color": settings.textColor,
        "--reader-paragraph-spacing": `${settings.paragraphSpacing}em`,
    } as React.CSSProperties;

    return {
        settings,
        setSettings,
        applyTheme,
        resetSettings,
        cssVariables,
        isLoaded,
    };
}


interface PageSettings {
    currentPage: number;
    scrollPosition?: number;
}

export function usePageSettings(uploadId: string, initialPage?: number) {
    const { data: progress, isSuccess } = useReadingProgress(uploadId);
    const updateProgress = useUpdateReadingProgress();

    const [pageSettings, setPageSettingsState] = useState<PageSettings>({
        currentPage: initialPage ?? 1,
    });

    const [isLoaded, setIsLoaded] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pageSettingsRef = useRef(pageSettings);
    pageSettingsRef.current = pageSettings;

    const flushSave = useCallback((nextPageSettings: PageSettings, nextUploadId = uploadId) => {
        if (!nextUploadId) {
            return;
        }

        updateProgress.mutate({
            uploadId: nextUploadId,
            data: {
                current_page: nextPageSettings.currentPage,
                scroll_position: nextPageSettings.scrollPosition,
            },
        });
    }, [uploadId, updateProgress]);

    useEffect(() => {
        if (isSuccess) {
            setPageSettingsState(
                progress
                    ? {
                        currentPage: progress.current_page || 1,
                        scrollPosition: progress.scroll_position || undefined,
                    }
                    : {
                        currentPage: initialPage ?? 1,
                        scrollPosition: undefined,
                    }
            );
            setIsLoaded(true);
        }
    }, [initialPage, isSuccess, progress?.current_page, progress?.scroll_position, uploadId]);

    useEffect(() => {
        setIsLoaded(false);
    }, [uploadId]);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
                flushSave(pageSettingsRef.current);
            }
        };
    }, [flushSave]);

    const setPageSettings = useCallback(
        (newSettings: Partial<PageSettings>) => {
            setPageSettingsState((prev) => {
                const hasChanges = Object.entries(newSettings).some(
                    ([key, value]) => prev[key as keyof PageSettings] !== value
                );
                if (!hasChanges) return prev;

                const updated = { ...prev, ...newSettings };

                if (uploadId) {
                    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                    saveTimerRef.current = setTimeout(() => {
                        saveTimerRef.current = null;
                        flushSave(updated, uploadId);
                    }, 1000);
                }

                return updated;
            });
        },
        [flushSave, uploadId]
    );

    return {
        pageSettings,
        setPageSettings,
        setCurrentPage: (page: number) => setPageSettings({ currentPage: page }),
        isLoaded,
    };
}

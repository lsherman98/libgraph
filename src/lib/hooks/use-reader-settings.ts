import { useState, useEffect, useCallback } from "react";

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
    paragraphSpacing: 1.5,
};

const STORAGE_KEY = "reader-settings";

function loadSettings(): ReaderSettings {
    if (typeof window === "undefined") return DEFAULT_READER_SETTINGS;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...DEFAULT_READER_SETTINGS, ...parsed };
        }
    } catch (e) {
        console.error("Failed to load reader settings:", e);
    }
    return DEFAULT_READER_SETTINGS;
}

function saveSettings(settings: ReaderSettings): void {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error("Failed to save reader settings:", e);
    }
}

export function useReaderSettings() {
    const [settings, setSettingsState] = useState<ReaderSettings>(loadSettings);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setSettingsState(loadSettings());
        setIsLoaded(true);
    }, []);

    useEffect(() => {
        if (isLoaded) {
            saveSettings(settings);
        }
    }, [settings, isLoaded]);

    const setSettings = useCallback((newSettings: Partial<ReaderSettings>) => {
        setSettingsState((prev) => ({ ...prev, ...newSettings }));
    }, []);

    const applyTheme = useCallback((themeKey: ReaderThemeKey) => {
        const theme = READER_THEMES[themeKey];
        setSettingsState((prev) => ({
            ...prev,
            theme: themeKey,
            backgroundColor: theme.backgroundColor,
            textColor: theme.textColor,
        }));
    }, []);

    const resetSettings = useCallback(() => {
        setSettingsState(DEFAULT_READER_SETTINGS);
    }, []);

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

const PAGE_SETTINGS_PREFIX = "reader-page-";

interface PageSettings {
    currentPage: number;
    scrollPosition?: number;
}

export function usePageSettings(uploadId: string | undefined) {
    const [pageSettings, setPageSettingsState] = useState<PageSettings>({
        currentPage: 1,
    });

    const storageKey = uploadId ? `${PAGE_SETTINGS_PREFIX}${uploadId}` : null;

    useEffect(() => {
        if (!storageKey) return;

        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                setPageSettingsState(JSON.parse(stored));
            }
        } catch (e) {
            console.error("Failed to load page settings:", e);
        }
    }, [storageKey]);

    const setPageSettings = useCallback(
        (newSettings: Partial<PageSettings>) => {
            setPageSettingsState((prev) => {
                const hasChanges = Object.entries(newSettings).some(
                    ([key, value]) => prev[key as keyof PageSettings] !== value
                );
                if (!hasChanges) return prev;

                const updated = { ...prev, ...newSettings };
                if (storageKey) {
                    try {
                        localStorage.setItem(storageKey, JSON.stringify(updated));
                    } catch (e) {
                        console.error("Failed to save page settings:", e);
                    }
                }
                return updated;
            });
        },
        [storageKey]
    );

    return {
        pageSettings,
        setPageSettings,
        setCurrentPage: (page: number) => setPageSettings({ currentPage: page }),
    };
}

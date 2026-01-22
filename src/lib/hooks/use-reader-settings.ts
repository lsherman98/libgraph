import { useState, useEffect, useCallback } from "react";

// Font families available for the reader
export const FONT_FAMILIES = {
    system: { name: "System", value: "system-ui, -apple-system, sans-serif" },
    serif: { name: "Serif", value: "Georgia, 'Times New Roman', serif" },
    sans: { name: "Sans Serif", value: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    mono: { name: "Monospace", value: "'JetBrains Mono', 'Fira Code', monospace" },
    openDyslexic: { name: "OpenDyslexic", value: "'OpenDyslexic', sans-serif" },
} as const;

export type FontFamilyKey = keyof typeof FONT_FAMILIES;

// Preconfigured themes
export const READER_THEMES = {
    light: {
        name: "Light",
        backgroundColor: "#ffffff",
        textColor: "#1a1a1a",
        accentColor: "#3b82f6",
    },
    dark: {
        name: "Dark",
        backgroundColor: "#1a1a1a",
        textColor: "#e5e5e5",
        accentColor: "#60a5fa",
    },
    sepia: {
        name: "Sepia",
        backgroundColor: "#f4ecd8",
        textColor: "#5c4b37",
        accentColor: "#8b6914",
    },
    night: {
        name: "Night",
        backgroundColor: "#0d1117",
        textColor: "#c9d1d9",
        accentColor: "#58a6ff",
    },
    paper: {
        name: "Paper",
        backgroundColor: "#fffef9",
        textColor: "#333333",
        accentColor: "#2563eb",
    },
    forest: {
        name: "Forest",
        backgroundColor: "#1e2a1e",
        textColor: "#c8d6c8",
        accentColor: "#4ade80",
    },
    ocean: {
        name: "Ocean",
        backgroundColor: "#0f172a",
        textColor: "#cbd5e1",
        accentColor: "#38bdf8",
    },
    sunset: {
        name: "Sunset",
        backgroundColor: "#2d1f1f",
        textColor: "#e8d5d5",
        accentColor: "#f97316",
    },
} as const;

export type ReaderThemeKey = keyof typeof READER_THEMES;

// Reader settings interface
export interface ReaderSettings {
    // Typography
    fontSize: number; // in px, range 12-32
    fontFamily: FontFamilyKey;
    lineHeight: number; // multiplier, range 1.2-2.5
    letterSpacing: number; // in em, range -0.05 to 0.15

    // Layout
    maxWidth: number; // in px, range 400-1200
    paddingHorizontal: number; // in px, range 16-80
    paddingVertical: number; // in px, range 16-80
    textAlign: "left" | "justify" | "center";

    // Colors (can be customized beyond themes)
    theme: ReaderThemeKey | "custom";
    backgroundColor: string;
    textColor: string;

    // View mode
    viewMode: "scroll" | "paginate";

    // Advanced
    hyphenation: boolean;
    paragraphSpacing: number; // in em, range 0.5-3
}

// Default settings
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
    fontSize: 18,
    fontFamily: "serif",
    lineHeight: 1.8,
    letterSpacing: 0,
    maxWidth: 900,
    paddingHorizontal: 24,
    paddingVertical: 24,
    textAlign: "left",
    theme: "light",
    backgroundColor: READER_THEMES.light.backgroundColor,
    textColor: READER_THEMES.light.textColor,
    viewMode: "scroll",
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
            // Merge with defaults to handle missing keys from old versions
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

    // Load settings on mount (handles SSR)
    useEffect(() => {
        setSettingsState(loadSettings());
        setIsLoaded(true);
    }, []);

    // Save settings whenever they change
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

    // Generate CSS variables for the reader
    const cssVariables = {
        "--reader-font-size": `${settings.fontSize}px`,
        "--reader-font-family": FONT_FAMILIES[settings.fontFamily].value,
        "--reader-line-height": settings.lineHeight,
        "--reader-letter-spacing": `${settings.letterSpacing}em`,
        "--reader-max-width": `${settings.maxWidth}px`,
        "--reader-padding-x": `${settings.paddingHorizontal}px`,
        "--reader-padding-y": `${settings.paddingVertical}px`,
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

// Hook for page-specific settings (current page, scroll position, etc.)
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

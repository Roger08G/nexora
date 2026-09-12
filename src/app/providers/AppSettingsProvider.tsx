import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/shared/services/toast";

const STORAGE_KEY = "nexora.settings.v1";

export type AppSettings = {
    autoSaveDelayMs: number;
    autoSaveRequests: boolean;
    confirmDestructiveActions: boolean;
    requestTimeoutMs: number;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
    autoSaveDelayMs: 800,
    autoSaveRequests: true,
    confirmDestructiveActions: true,
    requestTimeoutMs: 30_000,
};

type AppSettingsContextValue = {
    resetSettings: () => void;
    settings: AppSettings;
    updateSettings: (changes: Partial<AppSettings>) => void;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>(loadSettings);

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            toast.error("No se pudieron guardar los ajustes", {
                description: "Los ajustes se conservarán durante esta sesión.",
                id: "settings-storage",
            });
        }
    }, [settings]);

    const value = useMemo<AppSettingsContextValue>(
        () => ({
            resetSettings: () => setSettings(DEFAULT_APP_SETTINGS),
            settings,
            updateSettings: (changes) =>
                setSettings((current) => sanitizeSettings({ ...current, ...changes })),
        }),
        [settings],
    );

    return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
    const context = useContext(AppSettingsContext);
    if (!context) throw new Error("useAppSettings debe utilizarse dentro de AppSettingsProvider");
    return context;
}

function loadSettings() {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) return DEFAULT_APP_SETTINGS;
        return sanitizeSettings({
            ...DEFAULT_APP_SETTINGS,
            ...(JSON.parse(stored) as Partial<AppSettings>),
        });
    } catch {
        return DEFAULT_APP_SETTINGS;
    }
}

function sanitizeSettings(settings: AppSettings): AppSettings {
    return {
        autoSaveDelayMs: clampNumber(settings.autoSaveDelayMs, 300, 5_000),
        autoSaveRequests:
            typeof settings.autoSaveRequests === "boolean"
                ? settings.autoSaveRequests
                : DEFAULT_APP_SETTINGS.autoSaveRequests,
        confirmDestructiveActions:
            typeof settings.confirmDestructiveActions === "boolean"
                ? settings.confirmDestructiveActions
                : DEFAULT_APP_SETTINGS.confirmDestructiveActions,
        requestTimeoutMs: clampNumber(settings.requestTimeoutMs, 1_000, 120_000),
    };
}

function clampNumber(value: number, minimum: number, maximum: number) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : minimum;
}

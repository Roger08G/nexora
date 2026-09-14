import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { WORKSPACES } from "@/app/config/workspaces";
import type { GlobalSearchItem } from "@/shared/types/search";
import type { WorkspaceId } from "@/shared/types/workspace";

type GlobalSearchContextValue = {
    closeSearch: () => void;
    isOpen: boolean;
    items: GlobalSearchItem[];
    openSearch: () => void;
    registerItems: (source: string, items: GlobalSearchItem[]) => void;
    selectItem: (item: GlobalSearchItem) => void;
};

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

type GlobalSearchProviderProps = {
    children: ReactNode;
    disabled?: boolean;
    onWorkspaceChange: (workspace: WorkspaceId) => void;
};

export function GlobalSearchProvider({
    children,
    disabled = false,
    onWorkspaceChange,
}: GlobalSearchProviderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [sources, setSources] = useState<Record<string, GlobalSearchItem[]>>({});

    const registerItems = useCallback((source: string, items: GlobalSearchItem[]) => {
        setSources((current) => ({ ...current, [source]: items }));
    }, []);

    const navigationItems = useMemo<GlobalSearchItem[]>(
        () =>
            WORKSPACES.map((workspace) => ({
                description: workspace.description,
                group: "Navegación",
                icon: workspace.icon,
                id: `workspace-${workspace.id}`,
                keywords: `${workspace.label} ${workspace.description}`,
                title: workspace.label,
                workspace: workspace.id,
            })),
        [],
    );
    const items = useMemo(
        () => [...navigationItems, ...Object.values(sources).flat()],
        [navigationItems, sources],
    );

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                if (!disabled) setIsOpen((current) => !current);
            } else if (event.key === "Escape") {
                setIsOpen(false);
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [disabled]);

    useEffect(() => {
        if (disabled) setIsOpen(false);
    }, [disabled]);

    const value = useMemo<GlobalSearchContextValue>(
        () => ({
            closeSearch: () => setIsOpen(false),
            isOpen: isOpen && !disabled,
            items,
            openSearch: () => {
                if (!disabled) setIsOpen(true);
            },
            registerItems,
            selectItem: (item) => {
                if (disabled) return;
                onWorkspaceChange(item.workspace);
                item.action?.();
                setIsOpen(false);
            },
        }),
        [disabled, isOpen, items, onWorkspaceChange, registerItems],
    );

    return <GlobalSearchContext.Provider value={value}>{children}</GlobalSearchContext.Provider>;
}

export function useGlobalSearch() {
    const context = useContext(GlobalSearchContext);
    if (!context) {
        throw new Error("useGlobalSearch debe utilizarse dentro de GlobalSearchProvider");
    }
    return context;
}

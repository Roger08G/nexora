import {
    FiActivity,
    FiClock,
    FiDatabase,
    FiHardDrive,
    FiLayers,
    FiSettings,
    FiZap,
} from "react-icons/fi";
import type { WorkspaceDefinition, WorkspaceId } from "@/shared/types/workspace";

export const WORKSPACES: readonly WorkspaceDefinition[] = [
    {
        id: "api",
        label: "API Client",
        description: "Peticiones HTTP y validaciones",
        accent: "violet",
        group: "primary",
        icon: FiZap,
    },
    {
        id: "mongodb",
        label: "MongoDB Explorer",
        description: "Colecciones y documentos",
        accent: "cyan",
        group: "primary",
        icon: FiDatabase,
    },
    {
        id: "postgresql",
        label: "PostgreSQL Studio",
        description: "Servidor SQL local por proyecto",
        accent: "orange",
        group: "primary",
        icon: FiHardDrive,
    },
    {
        id: "history",
        label: "Historial",
        description: "Ejecuciones locales",
        accent: "neutral",
        group: "secondary",
        icon: FiClock,
    },
    {
        id: "environments",
        label: "Variables de sesión",
        description: "Valores locales no persistentes",
        accent: "neutral",
        group: "secondary",
        icon: FiLayers,
    },
    {
        id: "monitors",
        label: "Monitores",
        description: "Ejecuciones programadas locales",
        accent: "neutral",
        group: "secondary",
        icon: FiActivity,
    },
    {
        id: "settings",
        label: "Ajustes",
        description: "Preferencias de la aplicación",
        accent: "neutral",
        group: "footer",
        icon: FiSettings,
    },
] as const;

export const DEFAULT_WORKSPACE: WorkspaceId = "api";

export function getWorkspace(id: WorkspaceId): WorkspaceDefinition {
    return WORKSPACES.find((workspace) => workspace.id === id) ?? WORKSPACES[0];
}

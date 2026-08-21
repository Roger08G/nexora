import type { IconType } from "react-icons";

export type WorkspaceId =
    "api" | "mongodb" | "postgresql" | "history" | "environments" | "monitors" | "settings";

export type WorkspaceGroup = "primary" | "secondary" | "footer";

export type WorkspaceDefinition = {
    id: WorkspaceId;
    label: string;
    description: string;
    accent: "violet" | "cyan" | "orange" | "neutral";
    group: WorkspaceGroup;
    icon: IconType;
};

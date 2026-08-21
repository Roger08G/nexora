import type { IconType } from "react-icons";
import type { WorkspaceId } from "@/shared/types/workspace";

export type GlobalSearchItem = {
    action?: () => void;
    description: string;
    group: string;
    icon: IconType;
    id: string;
    keywords?: string;
    title: string;
    workspace: WorkspaceId;
};

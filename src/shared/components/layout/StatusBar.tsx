import { FiCpu, FiFolder } from "react-icons/fi";
import type { WorkspaceDefinition } from "@/shared/types/workspace";

type StatusBarProps = {
    workspace: WorkspaceDefinition;
};

export function StatusBar({ workspace }: StatusBarProps) {
    return (
        <footer className="status-bar">
            <span className="status-bar__item">
                <span className="status-bar__indicator" />
                Interfaz local
            </span>
            <span className="status-bar__item status-bar__item--truncate">
                {workspace.description}
            </span>
            <span className="status-bar__item status-bar__item--push">
                <FiFolder aria-hidden="true" />
                Sin proyecto
            </span>
            <span className="status-bar__item status-bar__item--muted">
                <FiCpu aria-hidden="true" />
                Núcleo pendiente
            </span>
        </footer>
    );
}

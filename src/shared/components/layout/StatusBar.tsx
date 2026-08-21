import { useState } from "react";
import { FiCpu, FiFolder, FiFolderPlus } from "react-icons/fi";
import { useProject } from "@/app/providers/ProjectProvider";
import type { WorkspaceDefinition } from "@/shared/types/workspace";

type StatusBarProps = {
    workspace: WorkspaceDefinition;
};

export function StatusBar({ workspace }: StatusBarProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { busy, clearError, createProject, error, openProject, project } = useProject();

    return (
        <footer className="status-bar">
            <span className="status-bar__item">
                <span className="status-bar__indicator" />
                Interfaz local
            </span>
            <span className="status-bar__item status-bar__item--truncate">
                {workspace.description}
            </span>
            <div className="status-bar__project status-bar__item--push">
                <button
                    aria-expanded={isMenuOpen}
                    className="status-bar__project-trigger"
                    onClick={() => {
                        clearError();
                        setIsMenuOpen((current) => !current);
                    }}
                    title={project?.root ?? "Seleccionar un proyecto local"}
                    type="button"
                >
                    <FiFolder aria-hidden="true" />
                    {project?.name ?? "Sin proyecto"}
                </button>
                {isMenuOpen ? (
                    <div className="status-bar__project-menu">
                        <strong>{project ? project.name : "Proyecto local"}</strong>
                        <small>
                            {project?.root ?? "Abre una carpeta .nexora o crea un proyecto."}
                        </small>
                        {error ? <p>{error}</p> : null}
                        <div>
                            <button
                                disabled={busy}
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    void openProject();
                                }}
                                type="button"
                            >
                                <FiFolder aria-hidden="true" /> Abrir
                            </button>
                            <button
                                disabled={busy}
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    void createProject();
                                }}
                                type="button"
                            >
                                <FiFolderPlus aria-hidden="true" /> Crear
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
            <span className="status-bar__item status-bar__item--muted">
                <FiCpu aria-hidden="true" />
                Núcleo Rust activo
            </span>
        </footer>
    );
}

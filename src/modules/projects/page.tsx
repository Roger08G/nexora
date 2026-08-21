import { FiDatabase, FiFolder, FiFolderPlus, FiGitBranch, FiLock } from "react-icons/fi";
import { useProject } from "@/app/providers/ProjectProvider";
import { ProjectAction } from "@/modules/projects/components/ProjectAction";
import { NexoraMark } from "@/shared/components/brand/NexoraMark";
import "@/modules/projects/styles/project-start.css";

const PRINCIPLES = [
    { icon: FiLock, label: "Privado y local" },
    { icon: FiGitBranch, label: "Preparado para Git" },
    { icon: FiDatabase, label: "API y datos unidos" },
] as const;

export function ProjectStartPage() {
    const { busy, clearError, createProject, error, openProject } = useProject();

    return (
        <section className="project-start">
            <div aria-hidden="true" className="project-start__ambient" />
            <header className="project-start__brand">
                <NexoraMark size={46} />
                <div>
                    <strong>Nexora</strong>
                    <span>Backend Workspace</span>
                </div>
            </header>

            <main className="project-launcher">
                <div className="project-launcher__intro">
                    <span className="project-launcher__eyebrow">Workspace local</span>
                    <h1>Elige un proyecto para comenzar</h1>
                    <p>
                        Nexora guarda la configuración, las rutas y los datos de desarrollo dentro
                        de tu propio proyecto. No necesita cuentas ni servicios en la nube.
                    </p>
                </div>

                <div className="project-launcher__panel">
                    <header>
                        <strong>Proyecto Nexora</strong>
                        <small>Selecciona cómo quieres iniciar esta sesión</small>
                    </header>
                    <div className="project-launcher__actions">
                        <ProjectAction
                            description="Selecciona una carpeta que ya contenga .nexora"
                            disabled={busy}
                            icon={FiFolder}
                            label="Abrir proyecto existente"
                            onClick={() => {
                                clearError();
                                void openProject();
                            }}
                            tone="primary"
                        />
                        <ProjectAction
                            description="Crea la estructura .nexora en una carpeta local"
                            disabled={busy}
                            icon={FiFolderPlus}
                            label="Crear un proyecto nuevo"
                            onClick={() => {
                                clearError();
                                void createProject();
                            }}
                            tone="secondary"
                        />
                    </div>
                    {error ? (
                        <div className="project-launcher__error" role="alert">
                            {error}
                        </div>
                    ) : null}
                    <footer>
                        {busy ? "Preparando el proyecto…" : "Todo permanece en tu equipo"}
                    </footer>
                </div>
            </main>

            <footer className="project-start__footer">
                <div>
                    {PRINCIPLES.map(({ icon: Icon, label }) => (
                        <span key={label}>
                            <Icon aria-hidden="true" />
                            {label}
                        </span>
                    ))}
                </div>
                <span>v0.1.0 · Tauri · React · Rust</span>
            </footer>
        </section>
    );
}

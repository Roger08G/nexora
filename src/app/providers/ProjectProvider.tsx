import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "@/shared/services/toast";
import { getErrorMessage, runCommand } from "@/shared/services/native";

export type NexoraProject = {
    id: string;
    name: string;
    projectBytes: number;
    projectFileCount: number;
    requestCount: number;
    root: string;
    schemaVersion: number;
};

export type ProjectLoadState = {
    id: number;
    kind: "create" | "open";
    minimumDurationMs: number;
    projectBytes: number;
    projectName: string;
    ready: boolean;
};

type ProjectContextValue = {
    busy: boolean;
    clearError: () => void;
    createProject: () => Promise<void>;
    error: string | null;
    finishProjectLoad: () => void;
    openProject: () => Promise<void>;
    project: NexoraProject | null;
    projectLoad: ProjectLoadState | null;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

type ProjectProviderProps = {
    children: ReactNode;
};

export function ProjectProvider({ children }: ProjectProviderProps) {
    const [project, setProject] = useState<NexoraProject | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projectLoad, setProjectLoad] = useState<ProjectLoadState | null>(null);
    const e2eBootstrapStarted = useRef(false);

    useEffect(() => {
        if (import.meta.env.MODE !== "e2e" || e2eBootstrapStarted.current) return;
        function openE2eProject(event: Event) {
            const root = (event as CustomEvent<unknown>).detail;
            if (e2eBootstrapStarted.current || typeof root !== "string" || root.trim().length === 0)
                return;
            e2eBootstrapStarted.current = true;
            void perform("open", projectNameFromRoot(root), () =>
                runCommand<NexoraProject>("open_project", { root }),
            ).catch((cause) => {
                const message = getErrorMessage(cause);
                setError(message);
                toast.error("No se pudo preparar el proyecto E2E", { description: message });
            });
        }
        window.addEventListener("nexora:e2e-open-project", openE2eProject);
        return () => window.removeEventListener("nexora:e2e-open-project", openE2eProject);
    }, []);

    async function selectDirectory(title: string) {
        const selection = await open({ directory: true, multiple: false, title });
        return typeof selection === "string" ? selection : null;
    }

    async function openProject() {
        const root = await selectDirectory("Abrir proyecto Nexora");
        if (!root) return;
        await perform("open", projectNameFromRoot(root), () =>
            runCommand<NexoraProject>("open_project", { root }),
        );
    }

    async function createProject() {
        const root = await selectDirectory("Crear proyecto Nexora en esta carpeta");
        if (!root) return;
        const name = projectNameFromRoot(root);
        await perform("create", name, () =>
            runCommand<NexoraProject>("create_project", { name, root }),
        );
    }

    async function perform(
        kind: ProjectLoadState["kind"],
        projectName: string,
        action: () => Promise<NexoraProject>,
    ) {
        const loadId = Date.now();
        setBusy(true);
        setError(null);
        setProjectLoad({
            id: loadId,
            kind,
            minimumDurationMs: kind === "create" ? 500 : 1_000,
            projectBytes: 0,
            projectName,
            ready: false,
        });
        try {
            const nextProject = await action();
            setProject(nextProject);
            setProjectLoad({
                id: loadId,
                kind,
                minimumDurationMs: kind === "create" ? 500 : existingProjectDuration(nextProject),
                projectBytes: nextProject.projectBytes,
                projectName: nextProject.name,
                ready: true,
            });
        } catch (cause) {
            const message = getErrorMessage(cause);
            setError(message);
            toast.error("No se pudo cargar el proyecto", { description: message });
            setProjectLoad(null);
        } finally {
            setBusy(false);
        }
    }

    const value = useMemo<ProjectContextValue>(
        () => ({
            busy,
            clearError: () => setError(null),
            createProject,
            error,
            finishProjectLoad: () => {
                if (projectLoad) {
                    toast.success(
                        projectLoad.kind === "create" ? "Proyecto creado" : "Proyecto cargado",
                        { description: projectLoad.projectName },
                    );
                }
                setProjectLoad(null);
            },
            openProject,
            project,
            projectLoad,
        }),
        [busy, error, project, projectLoad],
    );

    return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

function projectNameFromRoot(root: string) {
    return (
        root
            .replace(/[\\/]+$/, "")
            .split(/[\\/]/)
            .pop() || "Proyecto Nexora"
    );
}

function existingProjectDuration(project: NexoraProject) {
    const sizeWeight = Math.log2(1 + project.projectBytes / 262_144) * 260;
    const fileWeight = Math.min(project.projectFileCount * 5, 1_200);
    const requestWeight = Math.min(project.requestCount * 8, 800);
    return Math.round(
        Math.min(6_500, Math.max(900, 850 + sizeWeight + fileWeight + requestWeight)),
    );
}

export function useProject() {
    const context = useContext(ProjectContext);
    if (!context) throw new Error("useProject debe utilizarse dentro de ProjectProvider");
    return context;
}

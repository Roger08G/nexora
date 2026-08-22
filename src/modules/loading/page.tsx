import { useEffect, useRef, useState } from "react";
import { SilkWave } from "@/modules/loading/components/SilkWave";
import { NexoraMark } from "@/shared/components/brand/NexoraMark";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import "@/modules/loading/styles/loading.css";

const LOAD_STEPS = {
    create: [
        "Creando la estructura local",
        "Preparando el proyecto",
        "Montando los espacios de trabajo",
        "Nexora está lista",
    ],
    open: [
        "Leyendo la configuración local",
        "Cargando peticiones y datos",
        "Montando los espacios de trabajo",
        "Restaurando la sesión local",
        "Nexora está lista",
    ],
} as const;

const EXIT_DURATION_MS = 180;

type LoadingPageProps = {
    kind: "create" | "open";
    minimumDurationMs: number;
    onDone: () => void;
    projectBytes: number;
    projectName: string;
    ready: boolean;
};

export function LoadingPage({
    kind,
    minimumDurationMs,
    onDone,
    projectBytes,
    projectName,
    ready,
}: LoadingPageProps) {
    const [progress, setProgress] = useState(0);
    const [isExiting, setIsExiting] = useState(false);
    const startedAt = useRef(performance.now());
    const prefersReducedMotion = useReducedMotion();
    const steps = LOAD_STEPS[kind];
    const currentStep = Math.min(steps.length - 1, Math.floor((progress / 101) * steps.length));

    useEffect(() => {
        const interval = window.setInterval(() => {
            const elapsed = performance.now() - startedAt.current;
            const progressWindow = Math.max(220, minimumDurationMs - EXIT_DURATION_MS);
            const cap = ready ? 96 : 88;
            const nextProgress = Math.min(cap, (elapsed / progressWindow) * cap);
            setProgress((current) => Math.max(current, nextProgress));
        }, 45);

        return () => window.clearInterval(interval);
    }, [minimumDurationMs, ready]);

    useEffect(() => {
        if (!ready) return;

        let cancelled = false;
        let minimumTimer = 0;
        let finishTimer = 0;
        const elapsed = performance.now() - startedAt.current;
        const remainingBeforeExit = Math.max(0, minimumDurationMs - EXIT_DURATION_MS - elapsed);
        const minimumDisplay = new Promise<void>((resolve) => {
            minimumTimer = window.setTimeout(resolve, remainingBeforeExit);
        });
        const fontsReady = document.fonts?.ready ?? Promise.resolve();

        void Promise.all([minimumDisplay, fontsReady]).then(() => {
            if (cancelled) return;
            setProgress(100);
            setIsExiting(true);
            finishTimer = window.setTimeout(onDone, EXIT_DURATION_MS);
        });

        return () => {
            cancelled = true;
            window.clearTimeout(minimumTimer);
            window.clearTimeout(finishTimer);
        };
    }, [minimumDurationMs, onDone, ready]);

    const projectSize =
        kind === "create"
            ? "Proyecto nuevo"
            : projectBytes > 0
              ? formatBytes(projectBytes)
              : "Proyecto local";

    return (
        <section
            aria-label="Inicio de Nexora"
            aria-live="polite"
            className="loading-screen"
            data-exiting={isExiting}
            data-quick={kind === "create"}
            role="status"
        >
            {prefersReducedMotion ? (
                <div aria-hidden="true" className="loading-screen__silk-fallback" />
            ) : (
                <SilkWave className="loading-screen__silk" />
            )}
            <div aria-hidden="true" className="loading-screen__vignette" />
            <div aria-hidden="true" className="loading-screen__fade" />

            <div className="loading-screen__layout">
                <header className="loading-screen__brand loading-fade-up">
                    <NexoraMark size={44} />
                    <span>Nexora Studio</span>
                </header>

                <div className="loading-screen__hero">
                    <h1 className="loading-fade-up loading-delay-1">NEXORA</h1>
                    <p className="loading-fade-up loading-delay-2">
                        Cargando <strong>{projectName}</strong>. Tus APIs, MongoDB y PostgreSQL
                        continúan completamente en local.
                    </p>
                </div>

                <footer className="loading-screen__footer loading-fade-up loading-delay-3">
                    <div className="loading-screen__progress-label">
                        <span>{steps[currentStep]}</span>
                        <span>{String(Math.round(progress)).padStart(3, "0")}%</span>
                    </div>
                    <div
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={Math.round(progress)}
                        className="loading-screen__progress-track"
                        role="progressbar"
                    >
                        <span
                            className="loading-screen__progress-value"
                            style={{ width: `${progress}%` }}
                        >
                            <span className="loading-screen__sheen" />
                        </span>
                    </div>
                    <div className="loading-screen__meta">
                        <span>{projectSize} · desarrollo local</span>
                        <span>Tauri · React · Rust</span>
                    </div>
                </footer>
            </div>
        </section>
    );
}

function formatBytes(bytes: number) {
    if (bytes < 1_024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1_024;
    let unit = units[0];
    for (let index = 1; index < units.length && value >= 1_024; index += 1) {
        value /= 1_024;
        unit = units[index];
    }
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

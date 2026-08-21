import { lazy, Suspense, useEffect, useState } from "react";
import { NexoraMark } from "@/shared/components/brand/NexoraMark";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import "@/modules/loading/styles/loading.css";

const SilkWave = lazy(() =>
    import("@/modules/loading/components/SilkWave").then((module) => ({
        default: module.SilkWave,
    })),
);

const BOOT_STEPS = [
    "Preparando la interfaz",
    "Cargando recursos visuales",
    "Montando los espacios de trabajo",
    "Restaurando la sesión local",
    "Nexora está lista",
] as const;

type LoadingPageProps = {
    onDone: () => void;
};

export function LoadingPage({ onDone }: LoadingPageProps) {
    const [progress, setProgress] = useState(0);
    const [isExiting, setIsExiting] = useState(false);
    const prefersReducedMotion = useReducedMotion();
    const currentStep = Math.min(
        BOOT_STEPS.length - 1,
        Math.floor((progress / 101) * BOOT_STEPS.length),
    );

    useEffect(() => {
        let cancelled = false;
        const interval = window.setInterval(() => {
            setProgress((value) => Math.min(92, value + 3.4));
        }, 75);
        let minimumTimer = 0;
        const minimumDisplay = new Promise<void>((resolve) => {
            minimumTimer = window.setTimeout(resolve, 1550);
        });
        const fontsReady = document.fonts?.ready ?? Promise.resolve();

        void Promise.all([minimumDisplay, fontsReady]).then(() => {
            if (!cancelled) {
                window.clearInterval(interval);
                setProgress(100);
            }
        });

        return () => {
            cancelled = true;
            window.clearInterval(interval);
            window.clearTimeout(minimumTimer);
        };
    }, []);

    useEffect(() => {
        if (progress < 100) {
            return;
        }

        const exitTimer = window.setTimeout(() => setIsExiting(true), 420);
        const finishTimer = window.setTimeout(onDone, 1120);

        return () => {
            window.clearTimeout(exitTimer);
            window.clearTimeout(finishTimer);
        };
    }, [onDone, progress]);

    return (
        <section
            aria-label="Inicio de Nexora"
            aria-live="polite"
            className="loading-screen"
            data-exiting={isExiting}
            role="status"
        >
            {prefersReducedMotion ? (
                <div aria-hidden="true" className="loading-screen__silk-fallback" />
            ) : (
                <Suspense
                    fallback={<div aria-hidden="true" className="loading-screen__silk-fallback" />}
                >
                    <SilkWave className="loading-screen__silk" />
                </Suspense>
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
                        Un solo espacio local para tus APIs y tus datos. Cliente HTTP, MongoDB y
                        SQLite, unidos.
                    </p>
                </div>

                <footer className="loading-screen__footer loading-fade-up loading-delay-3">
                    <div className="loading-screen__progress-label">
                        <span>{BOOT_STEPS[currentStep]}</span>
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
                        <span>v0.1.0 · desarrollo local</span>
                        <span>Tauri · React · Rust</span>
                    </div>
                </footer>
            </div>
        </section>
    );
}

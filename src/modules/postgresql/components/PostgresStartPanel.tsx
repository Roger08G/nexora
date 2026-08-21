import { FiDatabase, FiPlay } from "react-icons/fi";
import type { ManagedPostgresStatus } from "@/modules/postgresql/types";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type PostgresStartPanelProps = {
    error: string | null;
    hasProject: boolean;
    isLoading: boolean;
    onStart: () => void;
    status: ManagedPostgresStatus | null;
};

export function PostgresStartPanel({
    error,
    hasProject,
    isLoading,
    onStart,
    status,
}: PostgresStartPanelProps) {
    const unavailable = status && !status.available;

    return (
        <div className="connection-form postgres-start">
            <div className="connection-form__card">
                <span className="connection-form__icon postgres-start__icon">
                    <FiDatabase aria-hidden="true" />
                </span>
                <h1>PostgreSQL local administrado</h1>
                <p>
                    Nexora crea un clúster SQL aislado para este proyecto, lo publica solo en
                    127.0.0.1 y guarda su contraseña en Windows Credential Manager.
                </p>
                <div className="postgres-start__details">
                    <span>
                        <strong>Datos</strong>
                        <small>.nexora/runtime/postgresql</small>
                    </span>
                    <span>
                        <strong>Base inicial</strong>
                        <small>nexora</small>
                    </span>
                    <span>
                        <strong>Runtime</strong>
                        <small>
                            {status?.version ? `PostgreSQL ${status.version}` : "Detectando"}
                        </small>
                    </span>
                </div>
                {error ? <p className="connection-form__error">{error}</p> : null}
                {unavailable ? (
                    <p className="connection-form__error">
                        Falta el runtime PostgreSQL local. Revisa la instalación de Nexora.
                    </p>
                ) : null}
                {!hasProject ? (
                    <p className="connection-form__error">
                        Abre o crea un proyecto Nexora antes de iniciar la base SQL.
                    </p>
                ) : null}
                <ActionButton
                    disabled={!hasProject || Boolean(unavailable) || isLoading}
                    icon={FiPlay}
                    onClick={onStart}
                    tone="primary"
                >
                    {isLoading ? "Iniciando PostgreSQL" : "Iniciar servidor local"}
                </ActionButton>
            </div>
        </div>
    );
}

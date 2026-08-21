import { FiDatabase, FiHardDrive, FiLink } from "react-icons/fi";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type MongoConnectionFormProps = {
    error: string | null;
    hasProject: boolean;
    isConnecting: boolean;
    managedAvailable: boolean;
    managedVersion: string | null;
    onConnectExternal: () => void;
    onStartManaged: () => void;
    onUriChange: (uri: string) => void;
    projectName: string | null;
    uri: string;
};

export function MongoConnectionForm({
    error,
    hasProject,
    isConnecting,
    managedAvailable,
    managedVersion,
    onConnectExternal,
    onStartManaged,
    onUriChange,
    projectName,
    uri,
}: MongoConnectionFormProps) {
    return (
        <div className="connection-form">
            <div className="connection-form__card">
                <span className="connection-form__icon">
                    <FiDatabase aria-hidden="true" />
                </span>
                <h1>MongoDB</h1>
                <p>Inicia una base aislada dentro del proyecto o conecta un servidor existente.</p>
                <ManagedConnectionOption
                    available={managedAvailable}
                    disabled={isConnecting}
                    hasProject={hasProject}
                    onStart={onStartManaged}
                    projectName={projectName}
                    version={managedVersion}
                />
                <div className="connection-form__divider">
                    <span>o conectar servidor externo</span>
                </div>
                <ExternalConnectionOption
                    disabled={isConnecting}
                    onConnect={onConnectExternal}
                    onUriChange={onUriChange}
                    uri={uri}
                />
                {error ? <div className="inline-error">{error}</div> : null}
            </div>
        </div>
    );
}

type ManagedConnectionOptionProps = {
    available: boolean;
    disabled: boolean;
    hasProject: boolean;
    onStart: () => void;
    projectName: string | null;
    version: string | null;
};

function ManagedConnectionOption({
    available,
    disabled,
    hasProject,
    onStart,
    projectName,
    version,
}: ManagedConnectionOptionProps) {
    const detail = !hasProject
        ? "Abre o crea un proyecto Nexora para habilitarlo."
        : available
          ? `Datos privados de ${projectName ?? "este proyecto"} · MongoDB ${version ?? "local"}`
          : "El runtime local de MongoDB no está instalado.";

    return (
        <section className="connection-option connection-option--managed">
            <div className="connection-option__copy">
                <span className="connection-option__glyph">
                    <FiHardDrive aria-hidden="true" />
                </span>
                <div>
                    <strong>MongoDB local administrado</strong>
                    <small>{detail}</small>
                </div>
            </div>
            <ActionButton
                disabled={disabled || !hasProject || !available}
                icon={FiHardDrive}
                onClick={onStart}
                tone="primary"
            >
                {disabled ? "Iniciando" : "Iniciar local"}
            </ActionButton>
        </section>
    );
}

type ExternalConnectionOptionProps = {
    disabled: boolean;
    onConnect: () => void;
    onUriChange: (uri: string) => void;
    uri: string;
};

function ExternalConnectionOption({
    disabled,
    onConnect,
    onUriChange,
    uri,
}: ExternalConnectionOptionProps) {
    return (
        <section className="connection-option connection-option--external">
            <label>
                <span>URI de conexión</span>
                <input
                    autoComplete="off"
                    onChange={(event) => onUriChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") onConnect();
                    }}
                    spellCheck={false}
                    value={uri}
                />
                <small>Solo vive en memoria durante esta sesión.</small>
            </label>
            <ActionButton
                disabled={disabled || !uri.trim()}
                icon={FiLink}
                onClick={onConnect}
                tone="ghost"
            >
                Conectar URI
            </ActionButton>
        </section>
    );
}

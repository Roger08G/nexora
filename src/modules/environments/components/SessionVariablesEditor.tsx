import { FiEye, FiEyeOff, FiPlus, FiTrash2 } from "react-icons/fi";
import { useState } from "react";
import type { SessionVariable } from "@/app/providers/SessionVariablesProvider";

type SessionVariablesEditorProps = {
    onAdd: () => void;
    onRemove: (id: string) => void;
    onUpdate: (id: string, changes: Partial<SessionVariable>) => void;
    variables: SessionVariable[];
};

export function SessionVariablesEditor({
    onAdd,
    onRemove,
    onUpdate,
    variables,
}: SessionVariablesEditorProps) {
    const [visible, setVisible] = useState<string[]>([]);

    return (
        <div className="session-variables">
            <header>
                <div>
                    <h1>Variables de sesión</h1>
                    <p>
                        Resuelve referencias como {"{{baseUrl}}"} o {"{{token}}"} al ejecutar. Los
                        valores viven únicamente en memoria y se borran al cerrar Nexora.
                    </p>
                </div>
                <button onClick={onAdd} type="button">
                    <FiPlus aria-hidden="true" /> Añadir variable
                </button>
            </header>
            <div className="session-variables__notice">
                Guarda solo las referencias en tus peticiones. Nexora bloqueará headers y campos
                sensibles con valores directos al guardar en .nexora.
            </div>
            <div className="session-variables__table">
                <div className="session-variable-row session-variable-row--header">
                    <span>Nombre</span>
                    <span>Valor local</span>
                    <span>Acciones</span>
                </div>
                {variables.map((variable) => {
                    const isVisible = visible.includes(variable.id);
                    return (
                        <div className="session-variable-row" key={variable.id}>
                            <input
                                aria-label="Nombre de variable"
                                onChange={(event) =>
                                    onUpdate(variable.id, { key: event.target.value })
                                }
                                placeholder="token"
                                spellCheck={false}
                                value={variable.key}
                            />
                            <div className="session-variable-row__secret">
                                <input
                                    aria-label={`Valor de ${variable.key || "variable"}`}
                                    autoComplete="off"
                                    onChange={(event) =>
                                        onUpdate(variable.id, { value: event.target.value })
                                    }
                                    placeholder="Valor no persistente"
                                    spellCheck={false}
                                    type={isVisible ? "text" : "password"}
                                    value={variable.value}
                                />
                                <button
                                    aria-label={isVisible ? "Ocultar valor" : "Mostrar valor"}
                                    onClick={() =>
                                        setVisible((current) =>
                                            current.includes(variable.id)
                                                ? current.filter((id) => id !== variable.id)
                                                : [...current, variable.id],
                                        )
                                    }
                                    type="button"
                                >
                                    {isVisible ? (
                                        <FiEyeOff aria-hidden="true" />
                                    ) : (
                                        <FiEye aria-hidden="true" />
                                    )}
                                </button>
                            </div>
                            <button
                                aria-label={`Eliminar ${variable.key || "variable"}`}
                                className="session-variable-row__delete"
                                onClick={() => onRemove(variable.id)}
                                type="button"
                            >
                                <FiTrash2 aria-hidden="true" />
                            </button>
                        </div>
                    );
                })}
                {variables.length === 0 ? (
                    <div className="session-variables__empty">
                        No hay variables. Añade una cuando una petición necesite valores locales.
                    </div>
                ) : null}
            </div>
        </div>
    );
}

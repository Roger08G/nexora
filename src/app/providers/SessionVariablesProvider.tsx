import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

export type SessionVariable = {
    id: string;
    key: string;
    value: string;
};

type SessionVariablesContextValue = {
    addVariable: () => void;
    removeVariable: (id: string) => void;
    updateVariable: (id: string, changes: Partial<SessionVariable>) => void;
    variables: SessionVariable[];
    values: Record<string, string>;
};

const SessionVariablesContext = createContext<SessionVariablesContextValue | null>(null);

export function SessionVariablesProvider({ children }: { children: ReactNode }) {
    const [variables, setVariables] = useState<SessionVariable[]>([]);

    const value = useMemo<SessionVariablesContextValue>(
        () => ({
            addVariable: () =>
                setVariables((current) => {
                    toast.info("Variable de sesión añadida");
                    return [...current, { id: crypto.randomUUID(), key: "", value: "" }];
                }),
            removeVariable: (id) =>
                setVariables((current) => {
                    toast.success("Variable de sesión eliminada");
                    return current.filter((variable) => variable.id !== id);
                }),
            updateVariable: (id, changes) =>
                setVariables((current) =>
                    current.map((variable) =>
                        variable.id === id ? { ...variable, ...changes } : variable,
                    ),
                ),
            variables,
            values: Object.fromEntries(
                variables
                    .filter((variable) => variable.key.trim())
                    .map((variable) => [variable.key.trim(), variable.value]),
            ),
        }),
        [variables],
    );

    return (
        <SessionVariablesContext.Provider value={value}>
            {children}
        </SessionVariablesContext.Provider>
    );
}

export function useSessionVariables() {
    const context = useContext(SessionVariablesContext);
    if (!context) {
        throw new Error("useSessionVariables debe utilizarse dentro de SessionVariablesProvider");
    }
    return context;
}

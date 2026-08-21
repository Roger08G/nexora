import { invoke } from "@tauri-apps/api/core";

export type NativeError = {
    code: string;
    message: string;
};

export function runCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(command, args);
}

export function getErrorMessage(error: unknown): string {
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string") return message;
    }
    return "Se ha producido un error inesperado";
}

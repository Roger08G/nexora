import type { ReactNode } from "react";
import { toast as sonnerToast, type ExternalToast } from "sonner";

const MAX_TOAST_CHARACTERS = 80;

type ToastMessage = ReactNode | (() => ReactNode);

function normalizeOptions(options?: ExternalToast): ExternalToast | undefined {
    if (!options) return undefined;
    return {
        ...options,
        description: truncateNode(options.description),
    };
}

function truncateNode(value: ExternalToast["description"]) {
    if (typeof value !== "string") return value;
    const characters = Array.from(value);
    if (characters.length <= MAX_TOAST_CHARACTERS) return value;
    return `${characters.slice(0, MAX_TOAST_CHARACTERS - 1).join("")}…`;
}

function truncateMessage(value: ToastMessage): ToastMessage {
    return typeof value === "string" ? truncateNode(value) : value;
}

export const toast = {
    error(message: ToastMessage, options?: ExternalToast) {
        return sonnerToast.error(truncateMessage(message), normalizeOptions(options));
    },
    info(message: ToastMessage, options?: ExternalToast) {
        return sonnerToast.info(truncateMessage(message), normalizeOptions(options));
    },
    loading(message: ToastMessage, options?: ExternalToast) {
        return sonnerToast.loading(truncateMessage(message), normalizeOptions(options));
    },
    success(message: ToastMessage, options?: ExternalToast) {
        return sonnerToast.success(truncateMessage(message), normalizeOptions(options));
    },
    warning(message: ToastMessage, options?: ExternalToast) {
        return sonnerToast.warning(truncateMessage(message), normalizeOptions(options));
    },
};

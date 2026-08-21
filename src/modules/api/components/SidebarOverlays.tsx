import { useEffect, useRef, useState } from "react";
import { FiEdit3, FiFolderPlus, FiTrash2 } from "react-icons/fi";
import type { SavedRequest } from "@/modules/api/types";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type RequestContextMenuProps = {
    onClose: () => void;
    onDelete: () => void;
    onRename: () => void;
    request: SavedRequest;
    x: number;
    y: number;
};

export function RequestContextMenu({
    onClose,
    onDelete,
    onRename,
    request,
    x,
    y,
}: RequestContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function dismiss(event: PointerEvent) {
            if (!menuRef.current?.contains(event.target as Node)) onClose();
        }
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("pointerdown", dismiss);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("blur", onClose);
        return () => {
            window.removeEventListener("pointerdown", dismiss);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("blur", onClose);
        };
    }, [onClose]);

    const left = Math.min(x, window.innerWidth - 206);
    const top = Math.min(y, window.innerHeight - 116);

    return (
        <div
            aria-label={`Acciones de ${request.name}`}
            className="request-context-menu"
            ref={menuRef}
            role="menu"
            style={{ left, top }}
        >
            <button
                onClick={() => {
                    onClose();
                    onRename();
                }}
                role="menuitem"
                type="button"
            >
                <FiEdit3 aria-hidden="true" />
                Cambiar nombre
            </button>
            <button
                className="request-context-menu__danger"
                onClick={() => {
                    onClose();
                    onDelete();
                }}
                role="menuitem"
                type="button"
            >
                <FiTrash2 aria-hidden="true" />
                Eliminar petición
            </button>
        </div>
    );
}

type TextPromptDialogProps = {
    confirmLabel: string;
    description: string;
    icon?: "folder" | "rename";
    initialValue?: string;
    label: string;
    maxLength?: number;
    onClose: () => void;
    onConfirm: (value: string) => void;
    title: string;
};

export function TextPromptDialog({
    confirmLabel,
    description,
    icon = "folder",
    initialValue = "",
    label,
    maxLength = 80,
    onClose,
    onConfirm,
    title,
}: TextPromptDialogProps) {
    const [value, setValue] = useState(initialValue);
    const valid = Boolean(value.trim());

    return (
        <div className="modal-backdrop" role="presentation">
            <form
                aria-modal="true"
                className="api-prompt-dialog"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (valid) onConfirm(value.trim());
                }}
                role="dialog"
            >
                <header>
                    <span>
                        {icon === "rename" ? (
                            <FiEdit3 aria-hidden="true" />
                        ) : (
                            <FiFolderPlus aria-hidden="true" />
                        )}
                    </span>
                    <div>
                        <strong>{title}</strong>
                        <small>{description}</small>
                    </div>
                </header>
                <label>
                    <span>{label}</span>
                    <input
                        autoFocus
                        maxLength={maxLength}
                        onChange={(event) => setValue(event.target.value)}
                        spellCheck={false}
                        value={value}
                    />
                </label>
                <footer>
                    <ActionButton onClick={onClose} tone="ghost">
                        Cancelar
                    </ActionButton>
                    <ActionButton disabled={!valid} type="submit" tone="primary">
                        {confirmLabel}
                    </ActionButton>
                </footer>
            </form>
        </div>
    );
}

type ConfirmRequestDeleteDialogProps = {
    onClose: () => void;
    onConfirm: () => void;
    request: SavedRequest;
};

export function ConfirmRequestDeleteDialog({
    onClose,
    onConfirm,
    request,
}: ConfirmRequestDeleteDialogProps) {
    return (
        <div className="modal-backdrop" role="presentation">
            <section aria-modal="true" className="api-prompt-dialog" role="alertdialog">
                <header>
                    <span className="api-prompt-dialog__danger">
                        <FiTrash2 aria-hidden="true" />
                    </span>
                    <div>
                        <strong>Eliminar petición</strong>
                        <small>Se borrará su archivo JSON del proyecto.</small>
                    </div>
                </header>
                <p>
                    ¿Quieres eliminar <strong>{request.name}</strong> de la carpeta{" "}
                    <strong>{request.collectionName}</strong>?
                </p>
                <footer>
                    <ActionButton onClick={onClose} tone="ghost">
                        Cancelar
                    </ActionButton>
                    <button className="api-prompt-dialog__delete" onClick={onConfirm} type="button">
                        Eliminar
                    </button>
                </footer>
            </section>
        </div>
    );
}

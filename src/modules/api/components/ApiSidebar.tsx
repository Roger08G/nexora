import { useMemo, useState } from "react";
import {
    FiChevronRight,
    FiFilePlus,
    FiFolder,
    FiFolderMinus,
    FiFolderPlus,
    FiSearch,
} from "react-icons/fi";
import {
    ConfirmRequestDeleteDialog,
    RequestContextMenu,
    TextPromptDialog,
} from "@/modules/api/components/SidebarOverlays";
import type { RequestFolder, SavedRequest } from "@/modules/api/types";

type ApiSidebarProps = {
    activeRequestId: string;
    folders: readonly RequestFolder[];
    hasProject: boolean;
    onCreateFolder: (name: string) => void;
    onCreateRequest: (folder: RequestFolder) => void;
    onDeleteRequest: (request: SavedRequest) => void;
    onRenameRequest: (request: SavedRequest, name: string) => void;
    onSelect: (request: SavedRequest) => void;
};

type RequestMenuState = {
    request: SavedRequest;
    x: number;
    y: number;
};

export function ApiSidebar({
    activeRequestId,
    folders,
    hasProject,
    onCreateFolder,
    onCreateRequest,
    onDeleteRequest,
    onRenameRequest,
    onSelect,
}: ApiSidebarProps) {
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<string[]>(["general"]);
    const [activeFolderId, setActiveFolderId] = useState("general");
    const [requestMenu, setRequestMenu] = useState<RequestMenuState | null>(null);
    const [renameTarget, setRenameTarget] = useState<SavedRequest | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<SavedRequest | null>(null);
    const [creatingFolder, setCreatingFolder] = useState(false);

    const filteredFolders = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return folders;

        return folders
            .map((folder) => ({
                ...folder,
                requests: folder.requests.filter((request) =>
                    `${request.name} ${request.url}`.toLowerCase().includes(normalizedQuery),
                ),
            }))
            .filter((folder) => folder.requests.length > 0);
    }, [folders, query]);

    function selectFolder(folderId: string) {
        setActiveFolderId(folderId);
        setExpanded((current) => (current.includes(folderId) ? current : [...current, folderId]));
    }

    return (
        <aside className="module-sidebar api-sidebar">
            <div className="module-sidebar__search">
                <FiSearch aria-hidden="true" />
                <input
                    aria-label="Filtrar peticiones"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filtrar peticiones"
                    value={query}
                />
                <button
                    aria-label="Nueva carpeta"
                    disabled={!hasProject}
                    onClick={() => setCreatingFolder(true)}
                    title="Nueva carpeta"
                    type="button"
                >
                    <FiFolderPlus aria-hidden="true" />
                </button>
            </div>

            <div className="module-sidebar__content">
                <p className="eyebrow">{hasProject ? "Peticiones del proyecto" : "Sin proyecto"}</p>
                {filteredFolders.map((folder) => {
                    const isExpanded = expanded.includes(folder.id) || Boolean(query);
                    const isActive = activeFolderId === folder.id;
                    return (
                        <section className="tree-group" key={folder.id}>
                            <button
                                aria-expanded={isExpanded}
                                className="tree-group__trigger"
                                data-active={isActive}
                                onClick={() => selectFolder(folder.id)}
                                type="button"
                            >
                                <FiChevronRight aria-hidden="true" data-expanded={isExpanded} />
                                {isExpanded ? (
                                    <FiFolderMinus aria-hidden="true" />
                                ) : (
                                    <FiFolder aria-hidden="true" />
                                )}
                                <span>{folder.name}</span>
                                <small>{folder.requests.length}</small>
                            </button>
                            {isExpanded ? (
                                <div className="tree-group__items">
                                    {folder.requests.map((request) => (
                                        <button
                                            className="request-tree-item"
                                            data-active={request.id === activeRequestId}
                                            key={request.id}
                                            onClick={() => onSelect(request)}
                                            onContextMenu={(event) => {
                                                event.preventDefault();
                                                setRequestMenu({
                                                    request,
                                                    x: event.clientX,
                                                    y: event.clientY,
                                                });
                                            }}
                                            type="button"
                                        >
                                            <span
                                                className="method-label"
                                                data-method={request.method}
                                            >
                                                {request.method}
                                            </span>
                                            <span>{request.name}</span>
                                        </button>
                                    ))}
                                    {isActive && !query ? (
                                        <button
                                            className="request-folder__create"
                                            onClick={() => onCreateRequest(folder)}
                                            type="button"
                                        >
                                            <FiFilePlus aria-hidden="true" />
                                            <span>Añadir nueva ruta</span>
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                        </section>
                    );
                })}
                {filteredFolders.length === 0 ? (
                    <p className="module-sidebar__empty">
                        {query
                            ? "No hay peticiones que coincidan."
                            : "Crea una carpeta con el botón + y añade rutas dentro."}
                    </p>
                ) : null}
            </div>

            {requestMenu ? (
                <RequestContextMenu
                    onClose={() => setRequestMenu(null)}
                    onDelete={() => setDeleteTarget(requestMenu.request)}
                    onRename={() => setRenameTarget(requestMenu.request)}
                    request={requestMenu.request}
                    x={requestMenu.x}
                    y={requestMenu.y}
                />
            ) : null}
            {creatingFolder ? (
                <TextPromptDialog
                    confirmLabel="Crear carpeta"
                    description="Las rutas se guardarán dentro de esta carpeta."
                    label="Nombre de la carpeta"
                    onClose={() => setCreatingFolder(false)}
                    onConfirm={(name) => {
                        setCreatingFolder(false);
                        onCreateFolder(name);
                    }}
                    title="Nueva carpeta"
                />
            ) : null}
            {renameTarget ? (
                <TextPromptDialog
                    confirmLabel="Cambiar nombre"
                    description={`${renameTarget.method} ${renameTarget.url}`}
                    icon="rename"
                    initialValue={renameTarget.name}
                    label="Nombre de la petición"
                    maxLength={120}
                    onClose={() => setRenameTarget(null)}
                    onConfirm={(name) => {
                        setRenameTarget(null);
                        onRenameRequest(renameTarget, name);
                    }}
                    title="Cambiar nombre"
                />
            ) : null}
            {deleteTarget ? (
                <ConfirmRequestDeleteDialog
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={() => {
                        setDeleteTarget(null);
                        onDeleteRequest(deleteTarget);
                    }}
                    request={deleteTarget}
                />
            ) : null}
        </aside>
    );
}

import { useMemo, useState } from "react";
import { FiChevronRight, FiFolder, FiFolderMinus, FiPlus, FiSearch } from "react-icons/fi";
import type { RequestCollection, SavedRequest } from "@/modules/api/types";

type ApiSidebarProps = {
    activeRequestId: string;
    collections: readonly RequestCollection[];
    hasProject: boolean;
    onCreate: () => void;
    onSelect: (request: SavedRequest) => void;
};

export function ApiSidebar({
    activeRequestId,
    collections,
    hasProject,
    onCreate,
    onSelect,
}: ApiSidebarProps) {
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<string[]>(["general"]);

    const filteredCollections = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return collections;

        return collections
            .map((collection) => ({
                ...collection,
                requests: collection.requests.filter((request) =>
                    `${request.name} ${request.url}`.toLowerCase().includes(normalizedQuery),
                ),
            }))
            .filter((collection) => collection.requests.length > 0);
    }, [collections, query]);

    function toggleCollection(collectionId: string) {
        setExpanded((current) =>
            current.includes(collectionId)
                ? current.filter((id) => id !== collectionId)
                : [...current, collectionId],
        );
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
                    aria-label="Nueva petición"
                    onClick={onCreate}
                    title="Nueva petición"
                    type="button"
                >
                    <FiPlus aria-hidden="true" />
                </button>
            </div>

            <div className="module-sidebar__content">
                <p className="eyebrow">{hasProject ? "Peticiones del proyecto" : "Sin proyecto"}</p>
                {filteredCollections.map((collection) => {
                    const isExpanded = expanded.includes(collection.id) || Boolean(query);
                    return (
                        <section className="tree-group" key={collection.id}>
                            <button
                                aria-expanded={isExpanded}
                                className="tree-group__trigger"
                                onClick={() => toggleCollection(collection.id)}
                                type="button"
                            >
                                <FiChevronRight aria-hidden="true" data-expanded={isExpanded} />
                                {isExpanded ? (
                                    <FiFolderMinus aria-hidden="true" />
                                ) : (
                                    <FiFolder aria-hidden="true" />
                                )}
                                <span>{collection.name}</span>
                                <small>{collection.requests.length}</small>
                            </button>
                            {isExpanded ? (
                                <div className="tree-group__items">
                                    {collection.requests.map((request) => (
                                        <button
                                            className="request-tree-item"
                                            data-active={request.id === activeRequestId}
                                            key={request.id}
                                            onClick={() => onSelect(request)}
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
                                </div>
                            ) : null}
                        </section>
                    );
                })}
                {filteredCollections.length === 0 ? (
                    <p className="module-sidebar__empty">
                        {query
                            ? "No hay peticiones que coincidan."
                            : "Crea una petición y abre un proyecto desde el pie para guardarla."}
                    </p>
                ) : null}
            </div>
        </aside>
    );
}

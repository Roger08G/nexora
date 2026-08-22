import { useState } from "react";
import { FiChevronRight, FiSearch } from "react-icons/fi";
import { LuLeaf } from "react-icons/lu";
import type { MongoDatabase } from "@/modules/mongodb/types";

type MongoSidebarProps = {
    connectionLabel: string;
    databases: readonly MongoDatabase[];
    onDisconnect: () => void;
    onExpand: (database: string) => void;
    onSelect: (database: string, collection: string) => void;
    selectedCollection: string;
    selectedDatabase: string;
};

export function MongoSidebar({
    connectionLabel,
    databases,
    onDisconnect,
    onExpand,
    onSelect,
    selectedCollection,
    selectedDatabase,
}: MongoSidebarProps) {
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<string[]>([databases[0]?.name ?? ""]);

    return (
        <aside className="module-sidebar mongo-sidebar">
            <div className="connection-summary">
                <span className="connection-summary__icon">
                    <LuLeaf aria-hidden="true" />
                </span>
                <div>
                    <strong>MongoDB</strong>
                    <small>{connectionLabel}</small>
                </div>
            </div>
            <div className="module-sidebar__search">
                <FiSearch aria-hidden="true" />
                <input
                    aria-label="Filtrar colecciones"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filtrar colecciones"
                    value={query}
                />
            </div>
            <div className="module-sidebar__content">
                <p className="eyebrow">Bases de datos</p>
                {databases.map((database) => {
                    const collections = (database.collections ?? []).filter((collection) =>
                        collection.toLowerCase().includes(query.toLowerCase()),
                    );
                    const isExpanded = expanded.includes(database.name) || Boolean(query);
                    if (query && collections.length === 0) return null;

                    return (
                        <section className="tree-group" key={database.name}>
                            <button
                                aria-expanded={isExpanded}
                                className="tree-group__trigger"
                                onClick={() => {
                                    if (!expanded.includes(database.name)) onExpand(database.name);
                                    setExpanded((current) =>
                                        current.includes(database.name)
                                            ? current.filter((name) => name !== database.name)
                                            : [...current, database.name],
                                    );
                                }}
                                type="button"
                            >
                                <FiChevronRight aria-hidden="true" data-expanded={isExpanded} />
                                <LuLeaf aria-hidden="true" />
                                <span>{database.name}</span>
                                <small>{database.collections?.length ?? "…"}</small>
                            </button>
                            {isExpanded ? (
                                <div className="tree-group__items">
                                    {collections.map((collection) => (
                                        <button
                                            className="collection-tree-item"
                                            data-active={
                                                selectedDatabase === database.name &&
                                                selectedCollection === collection
                                            }
                                            key={collection}
                                            onClick={() => onSelect(database.name, collection)}
                                            type="button"
                                        >
                                            <span className="collection-tree-item__dot" />
                                            <span>{collection}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </section>
                    );
                })}
                <button className="sidebar-disconnect" onClick={onDisconnect} type="button">
                    Desconectar
                </button>
            </div>
        </aside>
    );
}

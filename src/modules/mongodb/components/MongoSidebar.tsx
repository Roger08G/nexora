import { useState } from "react";
import { FiChevronRight, FiDatabase, FiSearch } from "react-icons/fi";
import type { DemoDatabase } from "@/modules/mongodb/data/mongodb.fixtures";

type MongoSidebarProps = {
    databases: readonly DemoDatabase[];
    onSelect: (database: string, collection: string) => void;
    selectedCollection: string;
    selectedDatabase: string;
};

export function MongoSidebar({
    databases,
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
                    <FiDatabase aria-hidden="true" />
                </span>
                <div>
                    <strong>MongoDB</strong>
                    <small>Sin conexión · vista de muestra</small>
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
                <p className="eyebrow">Bases de datos de muestra</p>
                {databases.map((database) => {
                    const collections = database.collections.filter((collection) =>
                        collection.name.toLowerCase().includes(query.toLowerCase()),
                    );
                    const isExpanded = expanded.includes(database.name) || Boolean(query);
                    if (query && collections.length === 0) return null;

                    return (
                        <section className="tree-group" key={database.name}>
                            <button
                                aria-expanded={isExpanded}
                                className="tree-group__trigger"
                                onClick={() =>
                                    setExpanded((current) =>
                                        current.includes(database.name)
                                            ? current.filter((name) => name !== database.name)
                                            : [...current, database.name],
                                    )
                                }
                                type="button"
                            >
                                <FiChevronRight aria-hidden="true" data-expanded={isExpanded} />
                                <FiDatabase aria-hidden="true" />
                                <span>{database.name}</span>
                                <small>{database.collections.length}</small>
                            </button>
                            {isExpanded ? (
                                <div className="tree-group__items">
                                    {collections.map((collection) => (
                                        <button
                                            className="collection-tree-item"
                                            data-active={
                                                selectedDatabase === database.name &&
                                                selectedCollection === collection.name
                                            }
                                            key={collection.name}
                                            onClick={() => onSelect(database.name, collection.name)}
                                            type="button"
                                        >
                                            <span className="collection-tree-item__dot" />
                                            <span>{collection.name}</span>
                                            <small>{collection.documents}</small>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </section>
                    );
                })}
            </div>
        </aside>
    );
}

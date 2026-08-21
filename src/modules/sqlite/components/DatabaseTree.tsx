import { useState } from "react";
import { FiChevronRight, FiColumns, FiFolder, FiHardDrive, FiKey, FiTable } from "react-icons/fi";
import type { SqliteDatabase } from "@/modules/sqlite/types";

type DatabaseTreeProps = {
    database: SqliteDatabase | null;
    onOpen: () => void;
    onSelect: (tableName: string) => void;
    selectedTable: string;
};

export function DatabaseTree({ database, onOpen, onSelect, selectedTable }: DatabaseTreeProps) {
    const [expanded, setExpanded] = useState<string[]>([selectedTable]);
    const tables = database?.tables ?? [];

    return (
        <aside className="module-sidebar sqlite-sidebar">
            <div className="connection-summary connection-summary--orange">
                <span className="connection-summary__icon">
                    <FiHardDrive aria-hidden="true" />
                </span>
                <div>
                    <strong>{database?.name ?? "Sin archivo abierto"}</strong>
                    <small>{database?.path ?? "SQLite local"}</small>
                </div>
                <button aria-label="Abrir archivo SQLite" onClick={onOpen} type="button">
                    <FiFolder aria-hidden="true" />
                </button>
            </div>
            <div className="module-sidebar__content">
                <p className="eyebrow">{database ? "Tablas" : "Base de datos"}</p>
                {tables.map((table) => {
                    const isExpanded = expanded.includes(table.name);
                    return (
                        <section className="tree-group" key={table.name}>
                            <button
                                aria-expanded={isExpanded}
                                className="table-tree-item"
                                data-active={selectedTable === table.name}
                                onClick={() => {
                                    onSelect(table.name);
                                    setExpanded((current) =>
                                        current.includes(table.name)
                                            ? current.filter((name) => name !== table.name)
                                            : [...current, table.name],
                                    );
                                }}
                                type="button"
                            >
                                <FiChevronRight aria-hidden="true" data-expanded={isExpanded} />
                                <FiTable aria-hidden="true" />
                                <span>{table.name}</span>
                            </button>
                            {isExpanded ? (
                                <ul className="column-list">
                                    {table.columns.map((column) => (
                                        <li key={column.name}>
                                            {column.primaryKey ? (
                                                <FiKey aria-hidden="true" />
                                            ) : (
                                                <FiColumns aria-hidden="true" />
                                            )}
                                            <span>{column.name}</span>
                                            <small>{column.dataType || "ANY"}</small>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>
                    );
                })}
                {!database ? (
                    <p className="module-sidebar__empty">
                        Abre un archivo .sqlite, .sqlite3 o .db para inspeccionar sus tablas.
                    </p>
                ) : null}
            </div>
        </aside>
    );
}

import { useState } from "react";
import { FiChevronRight, FiColumns, FiHardDrive, FiKey, FiTable } from "react-icons/fi";
import type { DemoTable } from "@/modules/sqlite/data/sqlite.fixtures";

type DatabaseTreeProps = {
    onSelect: (tableName: string) => void;
    selectedTable: string;
    tables: readonly DemoTable[];
};

export function DatabaseTree({ onSelect, selectedTable, tables }: DatabaseTreeProps) {
    const [expanded, setExpanded] = useState<string[]>([selectedTable]);

    return (
        <aside className="module-sidebar sqlite-sidebar">
            <div className="connection-summary connection-summary--orange">
                <span className="connection-summary__icon">
                    <FiHardDrive aria-hidden="true" />
                </span>
                <div>
                    <strong>Sin archivo abierto</strong>
                    <small>SQLite · estructura de muestra</small>
                </div>
            </div>
            <div className="module-sidebar__content">
                <p className="eyebrow">Tablas de muestra</p>
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
                                <small>{table.rows}</small>
                            </button>
                            {isExpanded ? (
                                <ul className="column-list">
                                    {table.columns.map((column) => (
                                        <li key={column.name}>
                                            {column.primary ? (
                                                <FiKey aria-hidden="true" />
                                            ) : (
                                                <FiColumns aria-hidden="true" />
                                            )}
                                            <span>{column.name}</span>
                                            <small>{column.type}</small>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>
                    );
                })}
            </div>
        </aside>
    );
}

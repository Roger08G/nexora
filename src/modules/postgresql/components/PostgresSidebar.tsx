import { useEffect, useState } from "react";
import { FiChevronRight, FiColumns, FiDatabase, FiKey, FiRefreshCw, FiTable } from "react-icons/fi";
import type {
    ManagedPostgresConnection,
    PostgresDatabase,
    PostgresSelection,
} from "@/modules/postgresql/types";

type PostgresSidebarProps = {
    connection: ManagedPostgresConnection;
    database: PostgresDatabase | null;
    isLoading: boolean;
    onRefresh: () => void;
    onSelect: (selection: PostgresSelection) => void;
    onStop: () => void;
    selection: PostgresSelection | null;
};

export function PostgresSidebar({
    connection,
    database,
    isLoading,
    onRefresh,
    onSelect,
    onStop,
    selection,
}: PostgresSidebarProps) {
    const [expandedSchemas, setExpandedSchemas] = useState<string[]>(["public"]);
    const [expandedTables, setExpandedTables] = useState<string[]>([]);

    useEffect(() => {
        if (!selection) return;
        setExpandedSchemas((current) =>
            current.includes(selection.schema) ? current : [...current, selection.schema],
        );
    }, [selection]);

    return (
        <aside className="module-sidebar postgres-sidebar">
            <div className="connection-summary connection-summary--orange">
                <span className="connection-summary__icon">
                    <FiDatabase aria-hidden="true" />
                </span>
                <div>
                    <strong>{database?.name ?? connection.database}</strong>
                    <small>{`127.0.0.1:${connection.port} · PostgreSQL ${database?.serverVersion ?? connection.version}`}</small>
                </div>
                <button
                    aria-label="Actualizar esquema PostgreSQL"
                    disabled={isLoading}
                    onClick={onRefresh}
                    type="button"
                >
                    <FiRefreshCw aria-hidden="true" />
                </button>
            </div>
            <div className="module-sidebar__content">
                <p className="eyebrow">Esquemas</p>
                {database?.schemas.map((schema) => {
                    const schemaExpanded = expandedSchemas.includes(schema.name);
                    return (
                        <section className="tree-group" key={schema.name}>
                            <button
                                aria-expanded={schemaExpanded}
                                className="tree-group__trigger"
                                onClick={() =>
                                    setExpandedSchemas((current) =>
                                        toggleValue(current, schema.name),
                                    )
                                }
                                type="button"
                            >
                                <FiChevronRight aria-hidden="true" data-expanded={schemaExpanded} />
                                <FiDatabase aria-hidden="true" />
                                <span>{schema.name}</span>
                                <small>{schema.tables.length}</small>
                            </button>
                            {schemaExpanded ? (
                                <div className="tree-group__items">
                                    {schema.tables.map((table) => {
                                        const key = `${schema.name}.${table.name}`;
                                        const tableExpanded = expandedTables.includes(key);
                                        const active =
                                            selection?.schema === schema.name &&
                                            selection.table === table.name;
                                        return (
                                            <section key={key}>
                                                <button
                                                    aria-expanded={tableExpanded}
                                                    className="table-tree-item"
                                                    data-active={active}
                                                    onClick={() => {
                                                        onSelect({
                                                            schema: schema.name,
                                                            table: table.name,
                                                        });
                                                        setExpandedTables((current) =>
                                                            toggleValue(current, key),
                                                        );
                                                    }}
                                                    type="button"
                                                >
                                                    <FiChevronRight
                                                        aria-hidden="true"
                                                        data-expanded={tableExpanded}
                                                    />
                                                    <FiTable aria-hidden="true" />
                                                    <span>{table.name}</span>
                                                    <small>
                                                        {table.kind === "VIEW" ? "view" : ""}
                                                    </small>
                                                </button>
                                                {tableExpanded ? (
                                                    <ul className="column-list">
                                                        {table.columns.map((column) => (
                                                            <li key={column.name}>
                                                                {column.primaryKey ? (
                                                                    <FiKey aria-hidden="true" />
                                                                ) : (
                                                                    <FiColumns aria-hidden="true" />
                                                                )}
                                                                <span>{column.name}</span>
                                                                <small>{column.dataType}</small>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </section>
                                        );
                                    })}
                                    {!schema.tables.length ? (
                                        <p className="postgres-sidebar__empty">Sin tablas</p>
                                    ) : null}
                                </div>
                            ) : null}
                        </section>
                    );
                })}
                {!database?.schemas.length ? (
                    <p className="module-sidebar__empty">No se encontraron esquemas de usuario.</p>
                ) : null}
            </div>
            <button className="sidebar-disconnect" onClick={onStop} type="button">
                Detener PostgreSQL local
            </button>
        </aside>
    );
}

function toggleValue(values: string[], value: string) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

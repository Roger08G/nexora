import { useState } from "react";
import { FiPlus, FiRefreshCw } from "react-icons/fi";
import { DocumentList } from "@/modules/mongodb/components/DocumentList";
import { MongoQueryBar } from "@/modules/mongodb/components/MongoQueryBar";
import { MongoSidebar } from "@/modules/mongodb/components/MongoSidebar";
import { DEMO_DATABASES, DEMO_DOCUMENTS } from "@/modules/mongodb/data/mongodb.fixtures";
import { ActionButton } from "@/shared/components/ui/ActionButton";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";

export function MongoDbPage() {
    const [selection, setSelection] = useState({ database: "nexora_local", collection: "users" });
    const [filter, setFilter] = useState('{ role: "developer" }');
    const [limit, setLimit] = useState("20");

    return (
        <section className="module-page mongodb-page">
            <MongoSidebar
                databases={DEMO_DATABASES}
                onSelect={(database, collection) => setSelection({ database, collection })}
                selectedCollection={selection.collection}
                selectedDatabase={selection.database}
            />
            <div className="module-workbench">
                <header className="workspace-heading">
                    <div>
                        <span>{selection.database}</span>
                        <small>/</small>
                        <strong>{selection.collection}</strong>
                    </div>
                    <StatusBadge>Datos de muestra</StatusBadge>
                    <div className="workspace-heading__actions">
                        <ActionButton disabled icon={FiPlus} tone="ghost">
                            Insertar
                        </ActionButton>
                        <ActionButton disabled icon={FiRefreshCw} tone="ghost">
                            Refrescar
                        </ActionButton>
                    </div>
                </header>
                <MongoQueryBar
                    filter={filter}
                    limit={limit}
                    onFilterChange={setFilter}
                    onLimitChange={setLimit}
                />
                <div className="panel-heading">
                    <div className="panel-tabs">
                        <button data-active type="button">
                            Documentos
                        </button>
                        <button disabled type="button">
                            Esquema
                        </button>
                        <button disabled type="button">
                            Índices
                        </button>
                    </div>
                    <span className="panel-heading__context">3 documentos de muestra</span>
                </div>
                <div className="workspace-scroll">
                    <DocumentList documents={DEMO_DOCUMENTS} />
                </div>
            </div>
        </section>
    );
}

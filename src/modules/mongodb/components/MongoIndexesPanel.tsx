import type { MongoIndex } from "@/modules/mongodb/types";
import { CodeViewer } from "@/shared/components/code/CodeViewer";

type MongoIndexesPanelProps = {
    error: string | null;
    indexes: readonly MongoIndex[];
    loading: boolean;
};

export function MongoIndexesPanel({ error, indexes, loading }: MongoIndexesPanelProps) {
    if (loading) return <p className="workspace-empty">Cargando índices…</p>;
    if (error) return <p className="workspace-empty">{error}</p>;
    if (!indexes.length) return <p className="workspace-empty">La colección no tiene índices.</p>;

    return (
        <div className="mongo-indexes">
            {indexes.map((index) => (
                <article className="mongo-index-card" key={index.name}>
                    <header>
                        <div>
                            <strong>{index.name}</strong>
                            <span>{index.unique ? "Único" : "No único"}</span>
                            {index.sparse ? <span>Disperso</span> : null}
                            {index.expireAfterSeconds !== null ? (
                                <span>TTL {index.expireAfterSeconds} s</span>
                            ) : null}
                        </div>
                    </header>
                    <CodeViewer
                        ariaLabel={`Claves del índice ${index.name}`}
                        language="json"
                        value={JSON.stringify(index.keys, null, 4)}
                    />
                </article>
            ))}
        </div>
    );
}

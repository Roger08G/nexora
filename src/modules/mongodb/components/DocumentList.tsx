import { FiCopy, FiFileText, FiTrash2 } from "react-icons/fi";

type DocumentListProps = {
    documents: readonly Record<string, unknown>[];
};

export function DocumentList({ documents }: DocumentListProps) {
    return (
        <div className="document-list">
            {documents.map((document, index) => (
                <article className="document-card" key={String(document._id)}>
                    <header>
                        <FiFileText aria-hidden="true" />
                        <span>documento {index + 1}</span>
                        <div>
                            <button aria-label="Copiar documento pendiente" disabled type="button">
                                <FiCopy aria-hidden="true" />
                            </button>
                            <button
                                aria-label="Eliminar documento pendiente"
                                disabled
                                type="button"
                            >
                                <FiTrash2 aria-hidden="true" />
                            </button>
                        </div>
                    </header>
                    <pre>{JSON.stringify(document, null, 2)}</pre>
                </article>
            ))}
        </div>
    );
}

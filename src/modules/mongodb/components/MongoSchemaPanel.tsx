type MongoSchemaPanelProps = {
    documents: readonly Record<string, unknown>[];
};

type MutableField = {
    documents: Set<number>;
    path: string;
    types: Set<string>;
};

export function MongoSchemaPanel({ documents }: MongoSchemaPanelProps) {
    const fields = inferSchema(documents);
    if (!documents.length) {
        return <p className="workspace-empty">Ejecuta una consulta para inferir el esquema.</p>;
    }

    return (
        <div className="mongo-schema">
            <header>
                <div>
                    <strong>Esquema inferido</strong>
                    <span>Muestra actual de {documents.length} documentos</span>
                </div>
                <small>{fields.length} campos</small>
            </header>
            <div className="mongo-schema__table">
                <div className="mongo-schema__row mongo-schema__row--header">
                    <span>Campo</span>
                    <span>Tipos detectados</span>
                    <span>Presencia</span>
                </div>
                {fields.map((field) => (
                    <div className="mongo-schema__row" key={field.path}>
                        <code>{field.path}</code>
                        <div>
                            {field.types.map((type) => (
                                <span className="mongo-type" key={type}>
                                    {type}
                                </span>
                            ))}
                        </div>
                        <span>
                            {field.present}/{documents.length} · {field.coverage}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function inferSchema(documents: readonly Record<string, unknown>[]) {
    const fields = new Map<string, MutableField>();
    documents.forEach((document, documentIndex) =>
        visitObject(document, "", documentIndex, fields),
    );
    return [...fields.values()]
        .map((field) => ({
            coverage: Math.round((field.documents.size / documents.length) * 100),
            path: field.path,
            present: field.documents.size,
            types: [...field.types].sort(),
        }))
        .sort((left, right) => left.path.localeCompare(right.path));
}

function visitObject(
    value: Record<string, unknown>,
    prefix: string,
    documentIndex: number,
    fields: Map<string, MutableField>,
) {
    for (const [key, fieldValue] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        const field = fields.get(path) ?? {
            documents: new Set<number>(),
            path,
            types: new Set<string>(),
        };
        field.documents.add(documentIndex);
        field.types.add(mongoType(fieldValue));
        fields.set(path, field);
        if (isNestedObject(fieldValue)) visitObject(fieldValue, path, documentIndex, fields);
    }
}

function mongoType(value: unknown): string {
    if (value === null) return "Null";
    if (Array.isArray(value)) {
        const types = [...new Set(value.map(mongoType))];
        return types.length ? `Array<${types.join(" | ")}>` : "Array";
    }
    if (typeof value === "object") {
        const object = value as Record<string, unknown>;
        if (typeof object.$oid === "string") return "ObjectId";
        if (typeof object.$date === "string") return "Date";
        if (typeof object.$numberDecimal === "string") return "Decimal128";
        return "Object";
    }
    if (typeof value === "number") return Number.isInteger(value) ? "Integer" : "Double";
    if (typeof value === "string") return "String";
    if (typeof value === "boolean") return "Boolean";
    if (typeof value === "bigint") return "Long";
    if (typeof value === "undefined") return "Undefined";
    return "Unknown";
}

function isNestedObject(value: unknown): value is Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== "object") return false;
    return !Object.keys(value as Record<string, unknown>).some((key) => key.startsWith("$"));
}

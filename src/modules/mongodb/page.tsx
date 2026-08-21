import { useEffect, useState } from "react";
import { FiDatabase, FiPlus, FiRefreshCw } from "react-icons/fi";
import { toast } from "sonner";
import { useAppSettings } from "@/app/providers/AppSettingsProvider";
import { useGlobalSearch } from "@/app/providers/GlobalSearchProvider";
import { useProject } from "@/app/providers/ProjectProvider";
import { MongoConnectionForm } from "@/modules/mongodb/components/MongoConnectionForm";
import { MongoDocumentDialog } from "@/modules/mongodb/components/MongoDocumentDialog";
import { MongoNamespaceDialog } from "@/modules/mongodb/components/MongoNamespaceDialog";
import { DocumentList } from "@/modules/mongodb/components/DocumentList";
import { MongoQueryBar } from "@/modules/mongodb/components/MongoQueryBar";
import { MongoSidebar } from "@/modules/mongodb/components/MongoSidebar";
import {
    connectMongo,
    createMongoCollection,
    deleteMongoDocument,
    disconnectMongo,
    findMongoDocuments,
    getManagedMongoStatus,
    insertMongoDocument,
    loadMongoCollections,
    loadMongoDatabases,
    startManagedMongo,
    stopManagedMongo,
    updateMongoDocument,
} from "@/modules/mongodb/services/mongodb.service";
import type {
    ManagedMongoStatus,
    MongoConnection,
    MongoDatabase,
    MongoSelection,
} from "@/modules/mongodb/types";
import { ActionButton } from "@/shared/components/ui/ActionButton";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";
import { getErrorMessage } from "@/shared/services/native";

type EditorState = {
    document: Record<string, unknown> | null;
    mode: "insert" | "edit";
    value: string;
};

type ConnectionMode = "external" | "managed";

export function MongoDbPage() {
    const { settings } = useAppSettings();
    const { registerItems } = useGlobalSearch();
    const { project } = useProject();
    const [uri, setUri] = useState("mongodb://localhost:27017");
    const [connectionId, setConnectionId] = useState<string | null>(null);
    const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(null);
    const [connectionLabel, setConnectionLabel] = useState("Servidor externo");
    const [managedStatus, setManagedStatus] = useState<ManagedMongoStatus | null>(null);
    const [databases, setDatabases] = useState<MongoDatabase[]>([]);
    const [selection, setSelection] = useState<MongoSelection | null>(null);
    const [filter, setFilter] = useState("{}");
    const [projection, setProjection] = useState("");
    const [limit, setLimit] = useState("20");
    const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [editorError, setEditorError] = useState<string | null>(null);
    const [namespaceEditor, setNamespaceEditor] = useState({
        collection: "documents",
        database: "app",
        open: false,
    });
    const [namespaceError, setNamespaceError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void getManagedMongoStatus()
            .then((status) => {
                if (!cancelled) setManagedStatus(status);
            })
            .catch((cause) => {
                if (!cancelled) setError(getErrorMessage(cause));
            });
        return () => {
            cancelled = true;
        };
    }, [project?.root]);

    useEffect(
        () => () => {
            if (!connectionId) return;
            if (connectionMode === "managed") {
                void stopManagedMongo();
            } else {
                void disconnectMongo(connectionId);
            }
        },
        [connectionId, connectionMode],
    );

    useEffect(() => {
        const items = connectionId
            ? databases.flatMap((database) => [
                  {
                      action: () => void expandDatabase(connectionId, database.name),
                      description: `${database.collections?.length ?? 0} colecciones`,
                      group: "MongoDB",
                      icon: FiDatabase,
                      id: `mongodb-database-${database.name}`,
                      keywords: database.name,
                      title: database.name,
                      workspace: "mongodb" as const,
                  },
                  ...(database.collections ?? []).map((collection) => ({
                      action: () => {
                          const next = { database: database.name, collection };
                          setSelection(next);
                          void query(connectionId, next);
                      },
                      description: database.name,
                      group: "Colecciones",
                      icon: FiDatabase,
                      id: `mongodb-collection-${database.name}-${collection}`,
                      keywords: `${database.name} ${collection}`,
                      title: collection,
                      workspace: "mongodb" as const,
                  })),
              ])
            : [];
        registerItems("mongodb-namespaces", items);
    }, [connectionId, databases, filter, limit, projection, registerItems]);

    async function connectExternal() {
        setIsLoading(true);
        setError(null);
        try {
            const connection = await connectMongo(uri);
            setConnectionMode("external");
            setConnectionLabel("Servidor externo");
            await activateConnection(connection);
            toast.success("MongoDB conectado", { description: "Servidor externo" });
        } catch (cause) {
            const message = getErrorMessage(cause);
            setError(message);
            toast.error("No se pudo conectar a MongoDB", { description: message });
        } finally {
            setIsLoading(false);
        }
    }

    async function startLocal() {
        if (!project) return;
        setIsLoading(true);
        setError(null);
        try {
            const connection = await startManagedMongo(project.root);
            setManagedStatus(await getManagedMongoStatus());
            setConnectionMode("managed");
            setConnectionLabel(`Local · 127.0.0.1:${connection.port}`);
            await activateConnection(connection);
            toast.success("MongoDB local iniciado", {
                description: `127.0.0.1:${connection.port} · ${connection.version}`,
            });
        } catch (cause) {
            const message = getErrorMessage(cause);
            setError(message);
            toast.error("No se pudo iniciar MongoDB local", { description: message });
        } finally {
            setIsLoading(false);
        }
    }

    async function activateConnection(connection: MongoConnection) {
        setConnectionId(connection.connectionId);
        setDatabases(connection.databases.map((name) => ({ name, collections: null })));
        const firstDatabase = connection.databases[0];
        if (firstDatabase) await expandDatabase(connection.connectionId, firstDatabase, true);
    }

    async function expandDatabase(
        activeConnectionId: string,
        database: string,
        selectFirst = false,
    ) {
        try {
            const collections = await loadMongoCollections(activeConnectionId, database);
            setDatabases((current) =>
                current.map((item) => (item.name === database ? { ...item, collections } : item)),
            );
            if (selectFirst && collections[0]) {
                const next = { database, collection: collections[0] };
                setSelection(next);
                await query(activeConnectionId, next);
            }
        } catch (cause) {
            setError(getErrorMessage(cause));
        }
    }

    async function query(activeConnectionId = connectionId, activeSelection = selection) {
        if (!activeConnectionId || !activeSelection) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await findMongoDocuments({
                ...activeSelection,
                connectionId: activeConnectionId,
                filter,
                limit: Number(limit) || 20,
                projection,
            });
            setDocuments(result.documents);
            toast.success("Consulta MongoDB completada", {
                description: `${result.count} documentos`,
                id: "mongodb-query",
            });
        } catch (cause) {
            const message = getErrorMessage(cause);
            setError(message);
            toast.error("Error en la consulta MongoDB", {
                description: message,
                id: "mongodb-query",
            });
        } finally {
            setIsLoading(false);
        }
    }

    async function disconnect() {
        if (connectionMode === "managed") {
            await stopManagedMongo().catch(() => undefined);
            setManagedStatus(await getManagedMongoStatus().catch(() => null));
        } else if (connectionId) {
            await disconnectMongo(connectionId).catch(() => undefined);
        }
        setConnectionId(null);
        setConnectionMode(null);
        setConnectionLabel("Servidor externo");
        setDatabases([]);
        setSelection(null);
        setDocuments([]);
        setError(null);
        toast.success("MongoDB desconectado");
    }

    async function saveDocument() {
        if (!connectionId || !selection || !editor) return;
        setIsLoading(true);
        setEditorError(null);
        try {
            const parsed = JSON.parse(editor.value) as Record<string, unknown>;
            if (editor.mode === "insert") {
                await insertMongoDocument({
                    ...selection,
                    connectionId,
                    document: JSON.stringify(parsed),
                });
            } else {
                const originalId = editor.document?._id;
                if (originalId === undefined) throw new Error("El documento no tiene _id");
                delete parsed._id;
                await updateMongoDocument({
                    ...selection,
                    connectionId,
                    filter: JSON.stringify({ _id: originalId }),
                    update: JSON.stringify({ $set: parsed }),
                });
            }
            toast.success(
                editor.mode === "insert" ? "Documento insertado" : "Documento actualizado",
            );
            setEditor(null);
            await query();
        } catch (cause) {
            const message = getErrorMessage(cause);
            setEditorError(message);
            toast.error("No se pudo guardar el documento", { description: message });
        } finally {
            setIsLoading(false);
        }
    }

    async function removeDocument(document: Record<string, unknown>) {
        if (!connectionId || !selection || document._id === undefined) return;
        if (
            settings.confirmDestructiveActions &&
            !window.confirm("¿Eliminar este documento? Esta acción no se puede deshacer.")
        )
            return;
        setIsLoading(true);
        try {
            await deleteMongoDocument({
                ...selection,
                connectionId,
                filter: JSON.stringify({ _id: document._id }),
            });
            toast.success("Documento eliminado");
            await query();
        } catch (cause) {
            const message = getErrorMessage(cause);
            setError(message);
            toast.error("No se pudo eliminar el documento", { description: message });
        } finally {
            setIsLoading(false);
        }
    }

    async function createCollection() {
        if (!connectionId) return;
        const database = namespaceEditor.database.trim();
        const collection = namespaceEditor.collection.trim();
        setIsLoading(true);
        setNamespaceError(null);
        try {
            await createMongoCollection({ collection, connectionId, database });
            const databaseNames = await loadMongoDatabases(connectionId);
            const collections = await loadMongoCollections(connectionId, database);
            setDatabases(
                databaseNames.map((name) => ({
                    name,
                    collections: name === database ? collections : null,
                })),
            );
            const next = { collection, database };
            setSelection(next);
            setDocuments([]);
            setNamespaceEditor((current) => ({ ...current, open: false }));
            toast.success("Colección creada", { description: `${database}.${collection}` });
        } catch (cause) {
            const message = getErrorMessage(cause);
            setNamespaceError(message);
            toast.error("No se pudo crear la colección", { description: message });
        } finally {
            setIsLoading(false);
        }
    }

    if (!connectionId) {
        return (
            <section className="module-page mongodb-page">
                <MongoConnectionForm
                    error={error}
                    hasProject={Boolean(project)}
                    isConnecting={isLoading}
                    managedAvailable={managedStatus?.available ?? false}
                    managedVersion={managedStatus?.version ?? null}
                    onConnectExternal={connectExternal}
                    onStartManaged={startLocal}
                    onUriChange={setUri}
                    projectName={project?.name ?? null}
                    uri={uri}
                />
            </section>
        );
    }

    return (
        <section className="module-page mongodb-page">
            <MongoSidebar
                connectionLabel={connectionLabel}
                databases={databases}
                onDisconnect={disconnect}
                onExpand={(database) => expandDatabase(connectionId, database)}
                onSelect={(database, collection) => {
                    const next = { database, collection };
                    setSelection(next);
                    void query(connectionId, next);
                }}
                selectedCollection={selection?.collection ?? ""}
                selectedDatabase={selection?.database ?? ""}
            />
            <div className="module-workbench">
                <header className="workspace-heading">
                    <div>
                        <span>{selection?.database ?? "Selecciona una base"}</span>
                        <small>/</small>
                        <strong>{selection?.collection ?? "colección"}</strong>
                    </div>
                    <StatusBadge tone={error ? "danger" : "success"}>
                        {error ? "Error" : connectionMode === "managed" ? "Local" : "Conectado"}
                    </StatusBadge>
                    <div className="workspace-heading__actions">
                        <ActionButton
                            icon={FiPlus}
                            onClick={() =>
                                setNamespaceEditor((current) => ({ ...current, open: true }))
                            }
                            tone="ghost"
                        >
                            Nueva colección
                        </ActionButton>
                        <ActionButton
                            disabled={!selection}
                            icon={FiPlus}
                            onClick={() =>
                                setEditor({ document: null, mode: "insert", value: "{\n  \n}" })
                            }
                            tone="ghost"
                        >
                            Insertar
                        </ActionButton>
                        <ActionButton
                            disabled={!selection || isLoading}
                            icon={FiRefreshCw}
                            onClick={() => query()}
                            tone="ghost"
                        >
                            Refrescar
                        </ActionButton>
                    </div>
                </header>
                <MongoQueryBar
                    filter={filter}
                    isLoading={isLoading}
                    limit={limit}
                    onFilterChange={setFilter}
                    onLimitChange={setLimit}
                    onProjectionChange={setProjection}
                    onRun={() => query()}
                    projection={projection}
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
                    <span className="panel-heading__context">
                        {error ?? `${documents.length} documentos`}
                    </span>
                </div>
                <div className="workspace-scroll">
                    {documents.length > 0 ? (
                        <DocumentList
                            documents={documents}
                            onDelete={removeDocument}
                            onEdit={(document) =>
                                setEditor({
                                    document,
                                    mode: "edit",
                                    value: JSON.stringify(document, null, 2),
                                })
                            }
                        />
                    ) : (
                        <p className="workspace-empty">
                            {error ?? "La consulta no ha devuelto documentos."}
                        </p>
                    )}
                </div>
            </div>
            {editor ? (
                <MongoDocumentDialog
                    error={editorError}
                    isSaving={isLoading}
                    mode={editor.mode}
                    onChange={(value) => setEditor({ ...editor, value })}
                    onClose={() => setEditor(null)}
                    onSave={saveDocument}
                    value={editor.value}
                />
            ) : null}
            {namespaceEditor.open ? (
                <MongoNamespaceDialog
                    collection={namespaceEditor.collection}
                    database={namespaceEditor.database}
                    error={namespaceError}
                    isSaving={isLoading}
                    onClose={() => {
                        setNamespaceError(null);
                        setNamespaceEditor((current) => ({ ...current, open: false }));
                    }}
                    onCollectionChange={(collection) =>
                        setNamespaceEditor((current) => ({ ...current, collection }))
                    }
                    onDatabaseChange={(database) =>
                        setNamespaceEditor((current) => ({ ...current, database }))
                    }
                    onSave={createCollection}
                />
            ) : null}
        </section>
    );
}

import type {
    ManagedMongoConnection,
    ManagedMongoStatus,
    MongoConnection,
    MongoFindResult,
} from "@/modules/mongodb/types";
import { runCommand } from "@/shared/services/native";

export function connectMongo(uri: string) {
    return runCommand<MongoConnection>("connect_mongodb", { input: { uri } });
}

export function disconnectMongo(connectionId: string) {
    return runCommand<void>("disconnect_mongodb", { connectionId });
}

export function getManagedMongoStatus() {
    return runCommand<ManagedMongoStatus>("managed_mongodb_status");
}

export function startManagedMongo(projectRoot: string) {
    return runCommand<ManagedMongoConnection>("start_managed_mongodb", { projectRoot });
}

export function stopManagedMongo() {
    return runCommand<void>("stop_managed_mongodb");
}

export function loadMongoCollections(connectionId: string, database: string) {
    return runCommand<string[]>("list_mongodb_collections", { connectionId, database });
}

export function loadMongoDatabases(connectionId: string) {
    return runCommand<string[]>("list_mongodb_databases", { connectionId });
}

export function createMongoCollection(input: {
    collection: string;
    connectionId: string;
    database: string;
}) {
    return runCommand<void>("create_mongodb_collection", { input });
}

export function findMongoDocuments(input: {
    collection: string;
    connectionId: string;
    database: string;
    filter: string;
    limit: number;
    projection: string;
}) {
    return runCommand<MongoFindResult>("find_mongodb", {
        input: { ...input, sort: null },
    });
}

export function insertMongoDocument(input: {
    collection: string;
    connectionId: string;
    database: string;
    document: string;
}) {
    return runCommand<{ insertedId: unknown }>("insert_mongodb_document", { input });
}

export function updateMongoDocument(input: {
    collection: string;
    connectionId: string;
    database: string;
    filter: string;
    update: string;
}) {
    return runCommand<{ matchedCount: number; modifiedCount: number }>("update_mongodb_document", {
        input,
    });
}

export function deleteMongoDocument(input: {
    collection: string;
    connectionId: string;
    database: string;
    filter: string;
}) {
    return runCommand<{ deletedCount: number }>("delete_mongodb_document", { input });
}

export type MongoDatabase = {
    collections: string[] | null;
    name: string;
};

export type MongoConnection = {
    connectionId: string;
    databases: string[];
};

export type ManagedMongoConnection = MongoConnection & {
    dataPath: string;
    port: number;
    version: string;
};

export type ManagedMongoStatus = {
    active: boolean;
    available: boolean;
    connectionId: string | null;
    dataPath: string | null;
    port: number | null;
    projectRoot: string | null;
    runtimePath: string | null;
    version: string | null;
};

export type MongoFindResult = {
    count: number;
    documents: Record<string, unknown>[];
};

export type MongoSelection = {
    collection: string;
    database: string;
};

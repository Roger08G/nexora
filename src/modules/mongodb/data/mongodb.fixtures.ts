export type DemoCollection = {
    name: string;
    documents: number;
};

export type DemoDatabase = {
    name: string;
    collections: DemoCollection[];
};

export const DEMO_DATABASES: readonly DemoDatabase[] = [
    {
        name: "nexora_local",
        collections: [
            { name: "users", documents: 3 },
            { name: "sessions", documents: 8 },
            { name: "projects", documents: 4 },
        ],
    },
    {
        name: "nexora_test",
        collections: [
            { name: "fixtures", documents: 12 },
            { name: "runs", documents: 24 },
        ],
    },
] as const;

export const DEMO_DOCUMENTS: readonly Record<string, unknown>[] = [
    {
        _id: 'ObjectId("67a0c1f0e8d2")',
        name: "Ada Lovelace",
        role: "owner",
        enabled: true,
        tags: ["local", "demo"],
    },
    {
        _id: 'ObjectId("67a0c1f0e8d3")',
        name: "Linus Rivera",
        role: "developer",
        enabled: true,
        tags: ["demo"],
    },
    {
        _id: 'ObjectId("67a0c1f0e8d4")',
        name: "Mira Okafor",
        role: "viewer",
        enabled: false,
        tags: [],
    },
] as const;

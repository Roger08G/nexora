export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export const HTTP_METHODS: readonly HttpMethod[] = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
];

export type KeyValueItem = {
    id: string;
    enabled: boolean;
    key: string;
    value: string;
};

export type SavedRequest = {
    id: string;
    collectionId: string;
    collectionName: string;
    name: string;
    method: HttpMethod;
    url: string;
    params: KeyValueItem[];
    headers: KeyValueItem[];
    body: string;
};

export type RequestCollection = {
    id: string;
    name: string;
    requests: SavedRequest[];
};

export type RequestDraft = {
    method: HttpMethod;
    url: string;
    params: KeyValueItem[];
    headers: KeyValueItem[];
    body: string;
};

export type HttpResponse = {
    body: string;
    durationMs: number;
    headers: { key: string; value: string }[];
    sizeBytes: number;
    status: number;
    statusText: string;
};

export type ResponseState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; response: HttpResponse }
    | { status: "error"; message: string };

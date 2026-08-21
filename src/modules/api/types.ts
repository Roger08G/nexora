export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type KeyValueItem = {
    id: string;
    enabled: boolean;
    key: string;
    value: string;
};

export type SavedRequest = {
    id: string;
    collectionId: string;
    name: string;
    method: HttpMethod;
    path: string;
    body?: string;
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

export type ResponseState = "idle" | "backend-required";

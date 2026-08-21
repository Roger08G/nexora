import type { HttpMethod, HttpResponse, SavedRequest } from "@/modules/api/types";

export type HistorySource = "api" | "monitor";

export type HistoryEntry = {
    id: string;
    executedAtMs: number;
    requestId: string;
    requestName: string;
    method: HttpMethod;
    url: string;
    source: HistorySource;
    status: number | null;
    statusText: string;
    durationMs: number | null;
    sizeBytes: number | null;
    error: string | null;
};

export type HistoryEntryInput = Omit<HistoryEntry, "executedAtMs" | "id">;

export type RecordExecutionInput = {
    error?: string;
    request: SavedRequest;
    response?: HttpResponse;
    source: HistorySource;
};

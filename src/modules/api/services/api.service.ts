import type { HttpResponse, RequestDraft, SavedRequest } from "@/modules/api/types";
import { runCommand } from "@/shared/services/native";

export function executeRequest(
    request: RequestDraft,
    variables: Record<string, string>,
    timeoutMs: number,
) {
    return runCommand<HttpResponse>("execute_http", {
        request: { ...request, timeoutMs, variables },
    });
}

export function loadRequests(projectRoot: string) {
    return runCommand<SavedRequest[]>("list_requests", { projectRoot });
}

export function persistRequest(projectRoot: string, request: SavedRequest) {
    return runCommand<SavedRequest>("save_request", { projectRoot, request });
}

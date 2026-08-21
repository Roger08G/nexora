import type {
    HttpResponse,
    RequestDraft,
    RequestFolderSummary,
    SavedRequest,
} from "@/modules/api/types";
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

export function loadRequestFolders(projectRoot: string) {
    return runCommand<RequestFolderSummary[]>("list_request_folders", { projectRoot });
}

export function createRequestFolder(projectRoot: string, name: string) {
    return runCommand<RequestFolderSummary>("create_request_folder", { name, projectRoot });
}

export function persistRequest(projectRoot: string, request: SavedRequest) {
    return runCommand<SavedRequest>("save_request", { projectRoot, request });
}

export function deleteSavedRequest(projectRoot: string, collectionId: string, requestId: string) {
    return runCommand<void>("delete_request", { collectionId, projectRoot, requestId });
}

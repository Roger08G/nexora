import type { HistoryEntry, HistoryEntryInput } from "@/modules/history/types";
import { runCommand } from "@/shared/services/native";

export function loadHistory(projectRoot: string) {
    return runCommand<HistoryEntry[]>("list_history", { projectRoot });
}

export function appendHistory(projectRoot: string, entry: HistoryEntryInput) {
    return runCommand<HistoryEntry>("append_history", { entry, projectRoot });
}

export function deleteHistoryEntry(projectRoot: string, entryId: string) {
    return runCommand<void>("delete_history_entry", { entryId, projectRoot });
}

export function clearProjectHistory(projectRoot: string) {
    return runCommand<void>("clear_history", { projectRoot });
}

import type { LocalMonitor } from "@/modules/monitors/types";
import { runCommand } from "@/shared/services/native";

export function loadMonitors(projectRoot: string) {
    return runCommand<LocalMonitor[]>("list_monitors", { projectRoot });
}

export function persistMonitor(projectRoot: string, monitor: LocalMonitor) {
    return runCommand<LocalMonitor>("save_monitor", { monitor, projectRoot });
}

export function deleteSavedMonitor(projectRoot: string, monitorId: string) {
    return runCommand<void>("delete_monitor", { monitorId, projectRoot });
}

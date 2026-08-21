export type LocalMonitor = {
    id: string;
    name: string;
    requestId: string;
    requestName: string;
    intervalSeconds: number;
    enabled: boolean;
    createdAtMs: number;
    updatedAtMs: number;
};

export type MonitorRuntimeState = {
    durationMs?: number;
    error?: string;
    lastRunAt?: number;
    nextRunAt?: number;
    runCount: number;
    status: "idle" | "running" | "success" | "error";
    statusCode?: number;
};

export const MONITOR_INTERVALS = [10, 30, 60, 300, 900, 3_600] as const;

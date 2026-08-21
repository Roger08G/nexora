import { useState } from "react";
import type { ComponentType } from "react";
import { DEFAULT_WORKSPACE, getWorkspace } from "@/app/config/workspaces";
import { ApiPage } from "@/modules/api/page";
import { EnvironmentsPage } from "@/modules/environments/page";
import { HistoryPage } from "@/modules/history/page";
import { MongoDbPage } from "@/modules/mongodb/page";
import { MonitorsPage } from "@/modules/monitors/page";
import { SettingsPage } from "@/modules/settings/page";
import { SqlitePage } from "@/modules/sqlite/page";
import { ActivityRail } from "@/shared/components/layout/ActivityRail";
import { StatusBar } from "@/shared/components/layout/StatusBar";
import { TitleBar } from "@/shared/components/layout/TitleBar";
import type { WorkspaceId } from "@/shared/types/workspace";

const WORKSPACE_PAGES: Record<WorkspaceId, ComponentType> = {
    api: ApiPage,
    mongodb: MongoDbPage,
    sqlite: SqlitePage,
    history: HistoryPage,
    environments: EnvironmentsPage,
    monitors: MonitorsPage,
    settings: SettingsPage,
};

export function AppShell() {
    const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(DEFAULT_WORKSPACE);
    const workspace = getWorkspace(activeWorkspace);
    const ActivePage = WORKSPACE_PAGES[activeWorkspace];

    return (
        <div className="app-shell">
            <TitleBar />
            <div className="app-shell__body">
                <ActivityRail
                    activeWorkspace={activeWorkspace}
                    onWorkspaceChange={setActiveWorkspace}
                />
                <main className="app-shell__content">
                    <ActivePage />
                </main>
            </div>
            <StatusBar workspace={workspace} />
        </div>
    );
}

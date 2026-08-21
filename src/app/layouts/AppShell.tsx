import { useState } from "react";
import type { ComponentType } from "react";
import { DEFAULT_WORKSPACE, getWorkspace } from "@/app/config/workspaces";
import { WORKSPACES } from "@/app/config/workspaces";
import { GlobalSearchProvider } from "@/app/providers/GlobalSearchProvider";
import { ApiPage } from "@/modules/api/page";
import { EnvironmentsPage } from "@/modules/environments/page";
import { HistoryPage } from "@/modules/history/page";
import { MongoDbPage } from "@/modules/mongodb/page";
import { MonitorsPage } from "@/modules/monitors/page";
import { PostgreSqlPage } from "@/modules/postgresql/page";
import { SettingsPage } from "@/modules/settings/page";
import { ActivityRail } from "@/shared/components/layout/ActivityRail";
import { StatusBar } from "@/shared/components/layout/StatusBar";
import { TitleBar } from "@/shared/components/layout/TitleBar";
import { CommandPalette } from "@/shared/components/search/CommandPalette";
import type { WorkspaceId } from "@/shared/types/workspace";

const WORKSPACE_PAGES: Record<WorkspaceId, ComponentType> = {
    api: ApiPage,
    mongodb: MongoDbPage,
    postgresql: PostgreSqlPage,
    history: HistoryPage,
    environments: EnvironmentsPage,
    monitors: MonitorsPage,
    settings: SettingsPage,
};

export function AppShell() {
    const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(DEFAULT_WORKSPACE);
    const workspace = getWorkspace(activeWorkspace);

    return (
        <GlobalSearchProvider onWorkspaceChange={setActiveWorkspace}>
            <div className="app-shell">
                <TitleBar />
                <div className="app-shell__body">
                    <ActivityRail
                        activeWorkspace={activeWorkspace}
                        onWorkspaceChange={setActiveWorkspace}
                    />
                    <main className="app-shell__content">
                        {WORKSPACES.map((definition) => {
                            const WorkspacePage = WORKSPACE_PAGES[definition.id];
                            return (
                                <div
                                    aria-hidden={definition.id !== activeWorkspace}
                                    className="workspace-view"
                                    data-active={definition.id === activeWorkspace}
                                    key={definition.id}
                                >
                                    <WorkspacePage />
                                </div>
                            );
                        })}
                    </main>
                </div>
                <StatusBar workspace={workspace} />
            </div>
            <CommandPalette />
        </GlobalSearchProvider>
    );
}

import { AppSettingsProvider } from "@/app/providers/AppSettingsProvider";
import { AppShell } from "@/app/layouts/AppShell";
import { ProjectProvider, useProject } from "@/app/providers/ProjectProvider";
import { SessionVariablesProvider } from "@/app/providers/SessionVariablesProvider";
import { LoadingPage } from "@/modules/loading/page";
import { ProjectStartPage } from "@/modules/projects/page";
import { AppToaster } from "@/shared/components/feedback/AppToaster";

export default function App() {
    return (
        <AppSettingsProvider>
            <ProjectProvider>
                <AppContent />
            </ProjectProvider>
            <AppToaster />
        </AppSettingsProvider>
    );
}

function AppContent() {
    const { finishProjectLoad, project, projectLoad } = useProject();

    return (
        <>
            {project ? (
                <SessionVariablesProvider key={project.id}>
                    <AppShell />
                </SessionVariablesProvider>
            ) : (
                <ProjectStartPage />
            )}
            {projectLoad ? (
                <LoadingPage
                    key={projectLoad.id}
                    kind={projectLoad.kind}
                    minimumDurationMs={projectLoad.minimumDurationMs}
                    onDone={finishProjectLoad}
                    projectBytes={projectLoad.projectBytes}
                    projectName={projectLoad.projectName}
                    ready={projectLoad.ready}
                />
            ) : null}
        </>
    );
}

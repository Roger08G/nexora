import { WORKSPACES } from "@/app/config/workspaces";
import type { WorkspaceDefinition, WorkspaceId } from "@/shared/types/workspace";

type ActivityRailProps = {
    activeWorkspace: WorkspaceId;
    onWorkspaceChange: (workspace: WorkspaceId) => void;
};

type ActivityButtonProps = ActivityRailProps & {
    workspace: WorkspaceDefinition;
};

function ActivityButton({ activeWorkspace, onWorkspaceChange, workspace }: ActivityButtonProps) {
    const Icon = workspace.icon;
    const isActive = workspace.id === activeWorkspace;

    return (
        <button
            aria-current={isActive ? "page" : undefined}
            aria-label={workspace.label}
            className={`activity-rail__button activity-rail__button--${workspace.accent}`}
            data-active={isActive}
            onClick={() => onWorkspaceChange(workspace.id)}
            title={`${workspace.label} · ${workspace.description}`}
            type="button"
        >
            <Icon aria-hidden="true" />
        </button>
    );
}

export function ActivityRail({ activeWorkspace, onWorkspaceChange }: ActivityRailProps) {
    const primary = WORKSPACES.filter((workspace) => workspace.group === "primary");
    const secondary = WORKSPACES.filter((workspace) => workspace.group === "secondary");
    const footer = WORKSPACES.filter((workspace) => workspace.group === "footer");

    const renderButton = (workspace: WorkspaceDefinition) => (
        <ActivityButton
            activeWorkspace={activeWorkspace}
            key={workspace.id}
            onWorkspaceChange={onWorkspaceChange}
            workspace={workspace}
        />
    );

    return (
        <nav aria-label="Módulos de Nexora" className="activity-rail">
            <div className="activity-rail__group">{primary.map(renderButton)}</div>
            <span aria-hidden="true" className="activity-rail__separator" />
            <div className="activity-rail__group">{secondary.map(renderButton)}</div>
            <div className="activity-rail__group activity-rail__group--footer">
                {footer.map(renderButton)}
            </div>
        </nav>
    );
}

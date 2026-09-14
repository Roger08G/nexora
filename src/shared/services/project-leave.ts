export type ProjectLeaveReason = "close" | "switch";
export type ProjectLeaveHandler = (reason: ProjectLeaveReason) => Promise<boolean>;

/** A stable snapshot avoids skipping or repeating handlers as React cleans up effects. */
export async function prepareProjectLeave(
    handlers: Iterable<ProjectLeaveHandler>,
    reason: ProjectLeaveReason,
) {
    for (const handler of [...handlers]) {
        if (!(await handler(reason))) return false;
    }
    return true;
}

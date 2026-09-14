/** In-memory permission: opening a project or loading enabled definitions never grants it. */
export class MonitorScheduleSession {
    private project: object | null = null;
    private generation = 0;

    start(project: object) {
        this.project = project;
        this.generation++;
    }

    pause() {
        this.project = null;
        this.generation++;
    }

    isAllowed(project: object | null): boolean {
        return project !== null && this.project === project;
    }

    capture(project: object | null): () => boolean {
        const generation = this.generation;
        return () => generation === this.generation && this.isAllowed(project);
    }
}

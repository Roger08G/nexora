import { describe, expect, test } from "bun:test";
import { MonitorScheduleSession } from "@/modules/monitors/services/scheduling";

describe("monitor scheduling permission", () => {
    test("an enabled imported definition does not authorize automatic HTTP", () => {
        const session = new MonitorScheduleSession();
        const project = { root: "repo", id: "same-id" };
        expect(session.isAllowed(project)).toBe(false);
        expect(session.capture(project)()).toBe(false);
        session.start(project);
        expect(session.isAllowed(project)).toBe(true);
        expect(session.isAllowed(null)).toBe(false);
    });

    test("clones and reopening the same root require a fresh explicit grant", () => {
        const session = new MonitorScheduleSession();
        const project = { root: "repo", id: "same-id" };
        session.start(project);
        expect(session.isAllowed({ ...project, root: "clone" })).toBe(false);
        expect(session.isAllowed({ ...project })).toBe(false);
        expect(new MonitorScheduleSession().isAllowed(project)).toBe(false);
    });

    test("revocation during an async load remains revoked even after restarting", async () => {
        const session = new MonitorScheduleSession();
        const project = {};
        session.start(project);
        const pendingRun = session.capture(project);
        await Promise.resolve();
        session.pause();
        expect(pendingRun()).toBe(false);
        session.start(project);
        expect(pendingRun()).toBe(false);
        expect(session.capture(project)()).toBe(true);
    });

    test("changing the authorized project invalidates a previously queued run", () => {
        const session = new MonitorScheduleSession();
        const original = {};
        session.start(original);
        const pendingRun = session.capture(original);
        session.start({});
        expect(pendingRun()).toBe(false);
    });
});

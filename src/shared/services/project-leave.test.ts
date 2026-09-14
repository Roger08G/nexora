import { describe, expect, test } from "bun:test";
import { prepareProjectLeave, type ProjectLeaveHandler } from "@/shared/services/project-leave";

describe("project and window leave guards", () => {
    test("waits for each guard and forwards the reason before permitting close", async () => {
        const order: string[] = [];
        const handlers: ProjectLeaveHandler[] = [
            async (reason) => {
                await Promise.resolve();
                order.push(`saved:${reason}`);
                return true;
            },
            async (reason) => {
                order.push(`history:${reason}`);
                return true;
            },
        ];
        expect(await prepareProjectLeave(handlers, "close")).toBe(true);
        expect(order).toEqual(["saved:close", "history:close"]);
    });

    test("vetoing a switch preserves the current project and skips later guards", async () => {
        let laterCalled = false;
        expect(
            await prepareProjectLeave(
                [
                    async () => false,
                    async () => {
                        laterCalled = true;
                        return true;
                    },
                ],
                "switch",
            ),
        ).toBe(false);
        expect(laterCalled).toBe(false);
    });

    test("effect re-registration does not repeat guards or skip a captured guard", async () => {
        const called: string[] = [];
        const handlers = new Set<ProjectLeaveHandler>();
        const second: ProjectLeaveHandler = async () => {
            called.push("second");
            return true;
        };
        handlers.add(async () => {
            called.push("first");
            handlers.delete(second);
            handlers.add(async () => {
                throw new Error("a new render must not join the current exit");
            });
            return true;
        });
        handlers.add(second);
        expect(await prepareProjectLeave(handlers, "switch")).toBe(true);
        expect(called).toEqual(["first", "second"]);
    });

    test("an unexpected save failure rejects instead of allowing data loss", async () => {
        await expect(
            prepareProjectLeave(
                [
                    async () => {
                        throw new Error("disk full");
                    },
                ],
                "close",
            ),
        ).rejects.toThrow("disk full");
    });
});

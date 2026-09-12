import { describe, expect, test } from "bun:test";
import { KeyedTaskQueue, LatestOperation } from "@/shared/services/async-tasks";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

describe("resource mutations", () => {
    test("three simultaneous saves finish in order and deletion runs last", async () => {
        const queue = new KeyedTaskQueue();
        const gate = deferred();
        const writes: string[] = [];
        const first = queue.enqueue("request", async () => {
            await gate.promise;
            writes.push("first");
        });
        const second = queue.enqueue("request", async () => {
            writes.push("second");
        });
        const third = queue.enqueue("request", async () => {
            writes.push("third");
        });
        const remove = queue.enqueue("request", async () => {
            writes.push("delete");
        });
        expect(queue.has("request")).toBe(true);
        expect(writes).toEqual([]);
        gate.resolve();
        await Promise.all([first, second, third, remove]);
        expect(writes).toEqual(["first", "second", "third", "delete"]);
        await Promise.resolve();
        expect(queue.has("request")).toBe(false);
    });

    test("failed writes do not poison the queue or block other requests", async () => {
        const queue = new KeyedTaskQueue();
        const gate = deferred();
        const failed = queue.enqueue("first", async () => {
            await gate.promise;
            throw new Error("disk full");
        });
        const failure = failed.catch((error: Error) => error.message);
        const next = queue.enqueue("first", async () => "recovered");
        expect(await queue.enqueue("second", async () => "independent")).toBe("independent");
        gate.resolve();
        expect(await failure).toBe("disk full");
        expect(await next).toBe("recovered");
    });

    test("reverting to a saved value is checked after pending writes finish", async () => {
        const queue = new KeyedTaskQueue();
        const gate = deferred();
        let persisted = "original";
        const edit = queue.enqueue("request", async () => {
            await gate.promise;
            persisted = "edit";
        });
        const revert = queue.enqueue("request", async () => {
            if (persisted !== "original") persisted = "original";
        });
        gate.resolve();
        await Promise.all([edit, revert]);
        expect(persisted).toBe("original");
    });
});

describe("selection-bound results", () => {
    test("responses arriving after switching selection or editing are stale", () => {
        const operations = new LatestOperation();
        const first = operations.next();
        operations.invalidate();
        expect(first()).toBe(false);
        const second = operations.next();
        const third = operations.next();
        expect(second()).toBe(false);
        expect(third()).toBe(true);
    });
});

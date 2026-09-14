/** Serializes mutations of the same resource without blocking unrelated resources. */
export class KeyedTaskQueue {
    private readonly tails = new Map<string, Promise<void>>();

    has(key: string): boolean {
        return this.tails.has(key);
    }

    async drain(): Promise<void> {
        // Include tasks appended while an earlier write or deletion is still completing.
        while (this.tails.size > 0) await Promise.all(this.tails.values());
    }

    enqueue<T>(key: string, action: () => Promise<T>): Promise<T> {
        const previous = this.tails.get(key) ?? Promise.resolve();
        const operation = previous.then(action);
        const tail = operation.then(
            () => undefined,
            () => undefined,
        );
        this.tails.set(key, tail);
        void tail.then(() => {
            if (this.tails.get(key) === tail) this.tails.delete(key);
        });
        return operation;
    }
}

/** Invalidates pending UI results when their selection or input changes. */
export class LatestOperation {
    private generation = 0;

    next(): () => boolean {
        const generation = ++this.generation;
        return () => generation === this.generation;
    }

    invalidate() {
        this.generation++;
    }
}

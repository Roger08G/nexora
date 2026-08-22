import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const E2E_API_PORT = 43_127;
export const E2E_API_URL = `http://127.0.0.1:${E2E_API_PORT}`;

export function createProjectFixture(root: string) {
    const nexora = join(root, ".nexora");
    mkdirSync(nexora, { recursive: true });
    mkdirSync(join(root, "folders"), { recursive: true });
    mkdirSync(join(root, "monitors"), { recursive: true });
    mkdirSync(join(root, "requests", "general"), { recursive: true });
    mkdirSync(join(root, "requests", "mutations"), { recursive: true });

    writeJson(join(nexora, "project.json"), {
        id: "00000000-0000-4000-8000-0000000000e2",
        name: "Nexora WebView E2E",
        schemaVersion: 2,
    });
    writeFileSync(join(nexora, ".gitignore"), "runtime/\n", "utf8");
    writeJson(join(root, "folders", "general.json"), { id: "general", name: "General" });
    writeJson(join(root, "folders", "mutations.json"), {
        id: "mutations",
        name: "Mutaciones",
    });

    writeRequest(root, {
        collectionId: "general",
        collectionName: "General",
        id: "health",
        method: "GET",
        name: "Health check",
        url: "{{baseUrl}}/health",
    });
    writeRequest(root, {
        collectionId: "general",
        collectionName: "General",
        headers: [
            item("header-auth", "Authorization", "Bearer {{token}}"),
            item("header-test", "X-Nexora-Test", "webview"),
        ],
        id: "variables-get",
        method: "GET",
        name: "Variables GET",
        params: [item("param-mode", "mode", "webview")],
        url: "{{baseUrl}}/echo",
    });

    const methods = ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
    for (const method of methods) {
        writeRequest(root, {
            body:
                method === "POST" || method === "PUT" || method === "PATCH"
                    ? '{\n  "name": "{{userName}}",\n  "method": "' + method + '"\n}'
                    : "",
            collectionId: "mutations",
            collectionName: "Mutaciones",
            headers: [item(`header-${method.toLowerCase()}`, "X-Nexora-Test", "webview")],
            id: `echo-${method.toLowerCase()}`,
            method,
            name: `Echo ${method}`,
            url: "{{baseUrl}}/echo",
        });
    }
}

export async function removeProjectFixture(root: string) {
    const normalized = root.replace(/[\\/]+$/, "");
    const name = normalized.split(/[\\/]/).pop() ?? "";
    if (!name.startsWith("nexora-webview-e2e-")) {
        throw new Error(`Se rechazó limpiar una ruta E2E inesperada: ${root}`);
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            rmSync(root, { force: true, recursive: true });
            return;
        } catch (error) {
            if (attempt === 19) throw error;
            await new Promise((resolveWait) => setTimeout(resolveWait, 250));
        }
    }
}

export function readSavedRequest(root: string, folder: string, request: string) {
    return JSON.parse(
        readFileSync(join(root, "requests", folder, `${request}.json`), "utf8"),
    ) as Record<string, unknown>;
}

type FixtureRequest = {
    body?: string;
    collectionId: string;
    collectionName: string;
    headers?: KeyValue[];
    id: string;
    method: string;
    name: string;
    params?: KeyValue[];
    url: string;
};

type KeyValue = {
    enabled: boolean;
    id: string;
    key: string;
    value: string;
};

function item(id: string, key: string, value: string): KeyValue {
    return { enabled: true, id, key, value };
}

function writeRequest(root: string, request: FixtureRequest) {
    writeJson(join(root, "requests", request.collectionId, `${request.id}.json`), {
        body: request.body ?? "",
        collectionId: request.collectionId,
        collectionName: request.collectionName,
        headers: request.headers ?? [],
        id: request.id,
        method: request.method,
        name: request.name,
        params: request.params ?? [],
        url: request.url,
    });
}

function writeJson(path: string, value: unknown) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

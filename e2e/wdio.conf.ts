import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TauriCapabilities } from "@wdio/tauri-service";
import {
    createProjectFixture,
    E2E_API_PORT,
    E2E_API_URL,
    removeProjectFixture,
} from "./support/fixture";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectRoot =
    process.env.NEXORA_E2E_PROJECT_ROOT ?? join(tmpdir(), `nexora-webview-e2e-${process.pid}`);
const targetRoot = process.env.CARGO_TARGET_DIR ?? join(repositoryRoot, "src-tauri", "target");
const executable = process.platform === "win32" ? "nexora.exe" : "nexora";
const appBinaryPath = join(targetRoot, "debug", executable);
let apiProcess: ChildProcess | null = null;

process.env.NEXORA_E2E_PROJECT_ROOT = projectRoot;
process.env.NEXORA_E2E_API_URL = E2E_API_URL;

export const config: WebdriverIO.Config = {
    runner: "local",
    specs: ["./specs/**/*.e2e.ts"],
    maxInstances: 1,
    capabilities: [
        {
            browserName: "tauri",
            "tauri:options": {
                application: appBinaryPath,
            },
        } as TauriCapabilities,
    ],
    services: [
        [
            "tauri",
            {
                appBinaryPath,
                commandTimeout: 60_000,
                driverProvider: "embedded",
                embeddedPort: 4_445,
                startTimeout: 60_000,
            },
        ],
    ],
    framework: "mocha",
    reporters: ["spec"],
    logLevel: "warn",
    bail: 0,
    waitforTimeout: 20_000,
    connectionRetryTimeout: 120_000,
    connectionRetryCount: 2,
    mochaOpts: {
        grep: process.env.NEXORA_E2E_GREP
            ? new RegExp(process.env.NEXORA_E2E_GREP, "i")
            : undefined,
        timeout: 180_000,
        ui: "bdd",
    },
    onPrepare: async () => {
        createProjectFixture(projectRoot);
        apiProcess = spawn(
            resolveBunExecutable(),
            ["run", "e2e/fixtures/api.ts", String(E2E_API_PORT)],
            {
                cwd: repositoryRoot,
                env: process.env,
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
            },
        );
        await waitForApi();
    },
    onComplete: async () => {
        if (apiProcess && !apiProcess.killed) apiProcess.kill();
        await removeProjectFixture(projectRoot);
    },
};

function resolveBunExecutable() {
    const executablePath = process.env.BUN_EXECUTABLE;
    if (executablePath) return executablePath;
    return process.platform === "win32" ? "bun.exe" : "bun";
}

async function waitForApi() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (apiProcess?.exitCode !== null) {
            throw new Error(`La API E2E terminó antes de iniciar (${apiProcess?.exitCode})`);
        }
        try {
            const response = await fetch(`${E2E_API_URL}/health`);
            if (response.ok) return;
        } catch {
            // El proceso todavía está levantando el puerto.
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error(`La API E2E no respondió en ${E2E_API_URL}`);
}

if (!basename(projectRoot).startsWith("nexora-webview-e2e-")) {
    throw new Error("La ruta temporal E2E no es segura");
}

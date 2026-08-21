import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));
const tauriDirectory = fileURLToPath(new URL("./src-tauri", import.meta.url));

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": sourceDirectory,
            "@tauri": tauriDirectory,
        },
    },
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: "ws",
                  host,
                  port: 1421,
              }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
});

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import {
    createProjectFixture,
    createScheduledProjectFixture,
    E2E_API_URL,
    readSavedRequest,
} from "../support/fixture";

const projectRoot = requiredEnvironment("NEXORA_E2E_PROJECT_ROOT");

describe("Nexora en el WebView real de Tauri", () => {
    before(async () => {
        await browser.setWindowSize(1440, 900);
        await $(".project-start").waitForDisplayed({ timeout: 10_000 });
        await expect($(".project-launcher h1")).toHaveText("Elige un proyecto para comenzar");
        await expect(await buttonOnPage("Abrir proyecto existente")).toBeDisplayed();
        await expect(await buttonOnPage("Crear un proyecto nuevo")).toBeDisplayed();

        await browser.execute((root: string) => {
            window.dispatchEvent(new CustomEvent("nexora:e2e-open-project", { detail: root }));
        }, projectRoot);

        const loading = await $(".loading-screen");
        await loading.waitForDisplayed({ timeout: 10_000 });
        await expect(loading).toHaveText(expect.stringContaining("Nexora WebView E2E"));
        await expect($(".loading-screen [role='progressbar']")).toBeDisplayed();
        expect(
            await $$(".loading-screen__silk, .loading-screen__silk-fallback").length,
        ).toBeGreaterThanOrEqual(1);

        await $(".api-sidebar").waitForDisplayed({ timeout: 30_000 });
        await $(".loading-screen").waitForExist({ reverse: true, timeout: 30_000 });
        await openWorkspace("Ajustes");
        await clickButton("Restablecer");
        await openWorkspace("API Client");
    });

    after(async () => {
        await stopLocalRuntime("MongoDB Explorer", ".mongo-sidebar .sidebar-disconnect");
        await stopLocalRuntime("PostgreSQL Studio", ".postgres-sidebar .sidebar-disconnect");
    });

    it("carga el proyecto local, mantiene las carpetas cerradas y aplica los colores HTTP", async () => {
        await expect($(".status-bar")).toHaveText(expect.stringContaining("Nexora WebView E2E"));

        const folderTriggers = await $$(".api-sidebar .tree-group__trigger");
        const folderCount = await folderTriggers.length;
        expect(folderCount).toBe(2);
        for (let index = 0; index < folderCount; index += 1) {
            const trigger = folderTriggers[index];
            expect(await trigger.getAttribute("aria-expanded")).toBe("false");
        }

        await clickButton("General");
        await clickButton("Mutaciones");
        const getColor = await $('[data-method="GET"]').getCSSProperty("color");
        const putColor = await $('[data-method="PUT"]').getCSSProperty("color");
        expect(getColor.value).not.toBe(putColor.value);
        expect(await $$(".api-sidebar .request-tree-item").length).toBe(8);

        const tabs = await $(".request-tabs");
        const newRoute = await $(".request-tabs__new");
        const activeTab = await $('.request-tab[data-active="true"]');
        const closeRoute = await activeTab.$(".request-tab__close");
        const [
            tabsLocation,
            tabsSize,
            newRouteLocation,
            newRouteSize,
            tabLocation,
            tabSize,
            closeLocation,
            closeSize,
        ] = await Promise.all([
            tabs.getLocation(),
            tabs.getSize(),
            newRoute.getLocation(),
            newRoute.getSize(),
            activeTab.getLocation(),
            activeTab.getSize(),
            closeRoute.getLocation(),
            closeRoute.getSize(),
        ]);
        expect(
            Math.abs(
                newRouteLocation.y +
                    newRouteSize.height / 2 -
                    (tabsLocation.y + tabsSize.height / 2),
            ),
        ).toBeLessThanOrEqual(1);
        expect(
            tabLocation.x + tabSize.width - (closeLocation.x + closeSize.width),
        ).toBeGreaterThanOrEqual(4);
        expect(closeLocation.y - tabLocation.y).toBeGreaterThanOrEqual(3);
        expect(
            tabLocation.y + tabSize.height - (closeLocation.y + closeSize.height),
        ).toBeGreaterThanOrEqual(3);
    });

    it("resuelve variables de sesión, resalta plantillas y ejecuta todos los métodos HTTP", async () => {
        await openWorkspace("Variables de sesión");
        await addSessionVariable("baseUrl", E2E_API_URL);
        await addSessionVariable("token", "nexora-e2e-token");
        await addSessionVariable("userName", "Roger E2E");

        await openWorkspace("API Client");
        await openRequest("Variables GET");
        const templateVariables = await $$(".request-editor .template-variable");
        expect(await templateVariables.length).toBeGreaterThanOrEqual(1);
        const variableColor = await templateVariables[0].getCSSProperty("color");
        expect(String(variableColor.value).replace(/\s/g, "")).toBe("rgb(232,117,25)");
        await clickElement(".request-editor .panel-tabs button:nth-child(2)");
        await browser.waitUntil(
            async () => (await $$(".request-editor .template-variable").length) >= 1,
        );

        await sendAndExpect(200);
        const body = await $(".response-result__code").getText();
        expect(body).toContain('"authorization": "Bearer nexora-e2e-token"');
        expect(body).toContain('"mode": "webview"');
        expect(body).toContain('"testHeader": "webview"');
        expect(await $$(".response-result__code .code-viewer__number").length).toBeGreaterThan(1);
        expect(await $$(".response-result__code .syntax-token--key").length).toBeGreaterThan(1);
        await clickElement(".response-panel .panel-tabs button:nth-child(2)");
        await expect($(".response-headers")).toHaveText(expect.stringContaining("x-nexora-e2e"));

        await openRequest("Echo POST");
        await clickElement(".request-editor .panel-tabs button:nth-child(3)");
        const formattedBody = '{\n    "name": "{{userName}}",\n    "method": "POST"\n}';
        await browser.waitUntil(
            async () => (await $('[aria-label="Body JSON"]').getValue()) === formattedBody,
        );
        expect(await $$(".code-editor__body .syntax-editor__gutter span").length).toBe(4);
        expect(await $$(".code-editor__body .syntax-token--key").length).toBeGreaterThanOrEqual(2);
        const bodyVariable = await $(".code-editor__body .syntax-token--template");
        await expect(bodyVariable).toHaveText("{{userName}}");
        const bodyVariableColor = await bodyVariable.getCSSProperty("color");
        expect(String(bodyVariableColor.value).replace(/\s/g, "")).toBe("rgb(232,117,25)");
        const editorMetrics = await browser.execute(() => {
            const textarea = document.querySelector<HTMLTextAreaElement>(
                '.code-editor__body textarea[aria-label="Body JSON"]',
            );
            const code = document.querySelector<HTMLElement>(".code-editor__body pre code");
            const line = code?.children.item(2);
            if (!textarea || !code || !line) throw new Error("No se encontró el editor JSON");

            const textareaStyle = getComputedStyle(textarea);
            const codeStyle = getComputedStyle(code);
            const mirror = document.createElement("span");
            mirror.textContent = line.textContent;
            Object.assign(mirror.style, {
                fontFamily: textareaStyle.fontFamily,
                fontFeatureSettings: textareaStyle.fontFeatureSettings,
                fontSize: textareaStyle.fontSize,
                fontStretch: textareaStyle.fontStretch,
                fontStyle: textareaStyle.fontStyle,
                fontVariantLigatures: textareaStyle.fontVariantLigatures,
                fontWeight: textareaStyle.fontWeight,
                letterSpacing: textareaStyle.letterSpacing,
                position: "fixed",
                visibility: "hidden",
                whiteSpace: "pre",
            });
            document.body.append(mirror);

            const range = document.createRange();
            range.selectNodeContents(line);
            const highlightedWidth = range.getBoundingClientRect().width;
            const textareaWidth = mirror.getBoundingClientRect().width;
            mirror.remove();

            return {
                codeFont: codeStyle.fontFamily,
                gap: highlightedWidth - textareaWidth,
                textareaFont: textareaStyle.fontFamily,
            };
        });
        expect(editorMetrics.codeFont).toBe(editorMetrics.textareaFont);
        expect(Math.abs(editorMetrics.gap)).toBeLessThanOrEqual(0.5);
        await sendAndExpect(201);

        const scenarios = [
            ["Echo PUT", 200],
            ["Echo PATCH", 200],
            ["Echo DELETE", 204],
            ["Echo HEAD", 200],
            ["Echo OPTIONS", 204],
        ] as const;
        for (const [requestName, status] of scenarios) {
            await openRequest(requestName);
            await sendAndExpect(status);
        }

        await $(".method-select__trigger").click();
        expect(await $$(".method-select__option").length).toBe(7);
        await expect($(".method-select__menu")).toBeDisplayed();
        await browser.keys("Escape");
    });

    it("mantiene la respuesta de la pestaña actual cuando termina una petición anterior", async () => {
        const key = `selection-${Date.now()}`;
        await openWorkspace("API Client");
        await openRequest("Health check");
        await $('[aria-label="URL de la petición"]').setValue(`${E2E_API_URL}/delay?key=${key}`);
        try {
            await clickButton("Enviar");
            await browser.waitUntil(async () => {
                const response = await fetch(`${E2E_API_URL}/delay-state?key=${key}`);
                return ((await response.json()) as { pending: boolean }).pending;
            });
            await openRequest("Echo POST");
            await sendAndExpect(201);
            await fetch(`${E2E_API_URL}/release-delay?key=${key}`, { method: "POST" });
            // The history entry confirms the old native HTTP execution has completed.
            await browser.waitUntil(async () => {
                const history = await $$(".history-item strong").map((entry) => entry.getText());
                return history.includes("Health check");
            });
            await expect($('.request-tab[data-active="true"]')).toHaveText(
                expect.stringContaining("Echo POST"),
            );
            await expect($(".response-result__meta strong")).toHaveText(
                expect.stringContaining("201"),
            );
            await expect($(".response-result__code")).toHaveText(
                expect.stringContaining('"method": "POST"'),
            );
            expect(await $(".response-result__code").getText()).not.toContain("late-response");
        } finally {
            await fetch(`${E2E_API_URL}/release-delay?key=${key}`, { method: "POST" });
            await openRequest("Health check");
            await $('[aria-label="URL de la petición"]').setValue("{{baseUrl}}/health");
            await browser.waitUntil(
                () =>
                    readSavedRequest(projectRoot, "general", "health").url === "{{baseUrl}}/health",
            );
        }
    });

    it("cierra pestañas con Ctrl+W sin cerrar la última", async () => {
        const initialCount = await $$(".request-tab").length;
        expect(initialCount).toBeGreaterThan(1);
        await browser.keys(["Control", "w"]);
        await browser.waitUntil(async () => (await $$(".request-tab").length) === initialCount - 1);

        while ((await $$(".request-tab").length) > 1) {
            const previousCount = await $$(".request-tab").length;
            await browser.keys(["Control", "w"]);
            await browser.waitUntil(
                async () => (await $$(".request-tab").length) === previousCount - 1,
            );
        }
        await browser.keys(["Control", "w"]);
        await browser.pause(250);
        expect(await $$(".request-tab").length).toBe(1);
    });

    it("crea carpetas, crea rutas, guarda automáticamente, renombra y elimina desde el menú contextual", async () => {
        await $('[aria-label="Nueva carpeta"]').click();
        await $(".api-prompt-dialog input").setValue("QA WebView");
        await clickButton("Crear carpeta");
        await expect(await button("QA WebView")).toBeDisplayed();
        await clickButton("QA WebView");
        await clickButton("Añadir nueva ruta");

        const urlInput = await $('[aria-label="URL de la petición"]');
        await urlInput.setValue("{{baseUrl}}/health?autosave=1");
        await browser.waitUntil(
            () =>
                findSavedRequestByName("Nueva petición", false)?.url ===
                "{{baseUrl}}/health?autosave=1",
            { timeout: 15_000 },
        );

        await openRequestContextAction("Nueva petición", "Cambiar nombre");
        const renameInput = await $(".api-prompt-dialog input");
        await renameInput.clearValue();
        await renameInput.setValue("Ruta WebView renombrada");
        await clickButton("Cambiar nombre");
        await expect(await button("Ruta WebView renombrada")).toBeDisplayed();

        await browser.waitUntil(
            () =>
                findSavedRequestByName("Ruta WebView renombrada", false)?.url ===
                "{{baseUrl}}/health?autosave=1",
            {
                timeout: 15_000,
                timeoutMsg: "La petición renombrada no se persistió",
            },
        );
        const stored = findSavedRequestByName("Ruta WebView renombrada");
        if (!stored) throw new Error("La petición renombrada no se persistió");
        expect(stored.url).toBe("{{baseUrl}}/health?autosave=1");

        await openRequestContextAction("Ruta WebView renombrada", "Eliminar petición");
        await clickButton("Eliminar");
        await browser.waitUntil(
            async () => !(await requestTreeItem("Ruta WebView renombrada").isExisting()),
        );
        expect(findSavedRequestByName("Ruta WebView renombrada", false)).toBeNull();
    });

    it("conserva una reversión durante autosave y no resucita una petición eliminada", async () => {
        await openWorkspace("API Client");
        await $(".request-tabs__new").click();
        const originalUrl = `${E2E_API_URL}/health?revision=original`;
        await $('[aria-label="URL de la petición"]').setValue(originalUrl);
        await browser.waitUntil(
            () => findSavedRequestByName("Nueva petición", false)?.url === originalUrl,
        );
        const requestId = findSavedRequestByName("Nueva petición")?.id;
        if (!requestId) throw new Error("La petición de regresión no tiene id");

        await installIpcGate(requestId);
        try {
            await $('[aria-label="URL de la petición"]').setValue(
                `${E2E_API_URL}/health?revision=pending`,
            );
            await waitForHeldSave();
            await $('[aria-label="URL de la petición"]').setValue(originalUrl);
            // Cross the configured 800 ms debounce while the earlier write is held.
            await browser.pause(1_200);
            await releaseHeldSave();
            await browser.waitUntil(async () => (await ipcGateState()).completedSaves >= 2);
            expect(findSavedRequestByName("Nueva petición")?.url).toBe(originalUrl);
        } finally {
            await restoreIpcGate();
        }

        await installIpcGate(requestId);
        try {
            await $('[aria-label="URL de la petición"]').setValue(
                `${E2E_API_URL}/health?revision=delete-pending`,
            );
            await waitForHeldSave();
            await openRequestContextAction("Nueva petición", "Eliminar petición");
            await clickButton("Eliminar");
            await releaseHeldSave();
            await browser.waitUntil(
                async () => !(await requestTreeItem("Nueva petición").isExisting()),
            );
            await browser.waitUntil(async () => (await ipcGateState()).completedSaves >= 1);
            await browser.pause(1_200);
            expect(findSavedRequestByName("Nueva petición", false)).toBeNull();
            expect(await $$(".request-tab").length).toBeGreaterThanOrEqual(1);
        } finally {
            await restoreIpcGate();
        }
    });

    it("conserva cambios externos de Git y permite recargar sin sobrescribirlos con el borrador", async () => {
        await openWorkspace("API Client");
        await openRequest("Health check");
        const path = join(projectRoot, "requests", "general", "health.json");
        const original = readSavedRequest(projectRoot, "general", "health");
        if (typeof original.url !== "string") throw new Error("La URL de la fixture no es válida");
        const externalUrl = `${E2E_API_URL}/health?external=git`;
        const draftUrl = `${E2E_API_URL}/health?draft=local`;
        writeFileSync(path, JSON.stringify({ ...original, url: externalUrl }, null, 4), "utf8");
        await $('[aria-label="URL de la petición"]').setValue(draftUrl);
        await expect($(".request-save-state")).toHaveText("Cambio externo");
        expect(readSavedRequest(projectRoot, "general", "health").url).toBe(externalUrl);
        expect(await $('[aria-label="URL de la petición"]').getValue()).toBe(draftUrl);

        await setConfirmResponse(true);
        try {
            await clickButton("Recargar");
            await browser.waitUntil(
                async () =>
                    (await $('[aria-label="URL de la petición"]').getValue()) === externalUrl,
            );
            await expect($(".request-save-state")).toHaveText(expect.stringContaining("Guardado"));
            // A discarded draft's old debounce must not rewrite the reloaded Git resource.
            await browser.pause(1_200);
            expect(readSavedRequest(projectRoot, "general", "health").url).toBe(externalUrl);
            await $('[aria-label="URL de la petición"]').setValue(original.url);
            await browser.waitUntil(
                () => readSavedRequest(projectRoot, "general", "health").url === original.url,
            );
        } finally {
            await setConfirmResponse(null);
        }
    });

    it("puede cancelar el cambio de proyecto sin perder un borrador con guardado manual", async () => {
        await openWorkspace("Ajustes");
        const autoSaveToggle = $(
            "//div[contains(concat(' ', normalize-space(@class), ' '), ' settings-field ') and .//strong[normalize-space(.)='Guardado automático']]//input",
        );
        expect(await autoSaveToggle.isSelected()).toBe(true);
        await autoSaveToggle.click();
        await openWorkspace("API Client");
        await openRequest("Health check");
        const original = readSavedRequest(projectRoot, "general", "health");
        if (typeof original.url !== "string") throw new Error("La URL de la fixture no es válida");
        const draftUrl = `${E2E_API_URL}/health?manual=keep`;
        await $('[aria-label="URL de la petición"]').setValue(draftUrl);
        await installIpcGate(null, projectRoot);
        await setConfirmResponse(false);
        try {
            await openProjectFromFooter();
            await browser.waitUntil(
                async () =>
                    await browser.execute(() => {
                        const shell = document.querySelector<HTMLElement>(".app-shell");
                        return (
                            shell?.getAttribute("aria-busy") === "false" &&
                            !document.querySelector(".loading-screen")
                        );
                    }),
            );
            expect((await ipcGateState()).openProjectCalls).toBe(0);
            expect(await $('[aria-label="URL de la petición"]').getValue()).toBe(draftUrl);
            expect(readSavedRequest(projectRoot, "general", "health").url).toBe(original.url);
            await $('[aria-label="URL de la petición"]').setValue(original.url);
        } finally {
            await restoreIpcGate();
            await setConfirmResponse(null);
            await openWorkspace("Ajustes");
            if (!(await autoSaveToggle.isSelected())) await autoSaveToggle.click();
            await openWorkspace("API Client");
        }
    });

    it("el cierre nativo espera un autosave pendiente antes de destruir la ventana", async () => {
        await openWorkspace("API Client");
        await openRequest("Health check");
        const original = readSavedRequest(projectRoot, "general", "health");
        if (typeof original.url !== "string") throw new Error("La URL de la fixture no es válida");
        const pendingUrl = `${E2E_API_URL}/health?window-close=flush`;
        await installIpcGate("health", null, true);
        try {
            await $('[aria-label="URL de la petición"]').setValue(pendingUrl);
            await waitForHeldSave();
            await browser.execute(async () => {
                const native = (
                    window as unknown as {
                        __TAURI_INTERNALS__: {
                            invoke: (command: string, args: object) => Promise<unknown>;
                        };
                    }
                ).__TAURI_INTERNALS__;
                await native.invoke("plugin:window|close", { label: "main" });
            });
            await browser.waitUntil(
                async () => (await $(".app-shell").getAttribute("aria-busy")) === "true",
            );
            expect((await ipcGateState()).destroyCalls).toBe(0);
            expect(readSavedRequest(projectRoot, "general", "health").url).toBe(original.url);
            await releaseHeldSave();
            await browser.waitUntil(async () => (await ipcGateState()).destroyCalls === 1);
            expect(readSavedRequest(projectRoot, "general", "health").url).toBe(pendingUrl);
            await browser.waitUntil(
                async () => (await $(".app-shell").getAttribute("aria-busy")) === "false",
            );
        } finally {
            await restoreIpcGate();
        }
        await $('[aria-label="URL de la petición"]').setValue(original.url);
        await browser.waitUntil(
            () => readSavedRequest(projectRoot, "general", "health").url === original.url,
        );
    });

    it("abre Ctrl+K, aplica ajustes persistentes y muestra toasts temáticos", async () => {
        await browser.keys(["Control", "k"]);
        const search = await $('[aria-label="Buscar en Nexora"]');
        await expect(search).toBeDisplayed();
        await search.setValue("Ajustes");
        await browser.keys("Enter");
        await expect($(".settings-page h1")).toHaveText("Ajustes");

        const autoSaveSelect = await $('[aria-label="Espera de autosave"]');
        await browser.execute(() => {
            const select = document.querySelector<HTMLSelectElement>(
                '[aria-label="Espera de autosave"]',
            );
            if (!select) throw new Error("No se encontró el selector de autosave");
            select.value = "1500";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await browser.waitUntil(async () => (await autoSaveSelect.getValue()) === "1500");

        const toast = await $(".nexora-toast");
        await toast.waitForDisplayed();
        const toastLocation = await toast.getLocation();
        const toastSize = await toast.getSize();
        const windowSize = await browser.getWindowSize();
        expect(toastLocation.x).toBeGreaterThan(windowSize.width / 2);
        expect(toastLocation.y).toBeGreaterThan(windowSize.height / 2);
        expect(toastSize.height).toBeLessThan(80);
        expect(await toast.$("[data-close-button]").isExisting()).toBe(false);

        const timeout = await $('[aria-label="Timeout HTTP en segundos"]');
        await timeout.setValue("12");
        await browser.keys("Tab");

        const destructiveToggle = await $(
            "//div[contains(concat(' ', normalize-space(@class), ' '), ' settings-field ') and .//strong[normalize-space(.)='Confirmar acciones destructivas']]//input",
        );
        expect(await destructiveToggle.isSelected()).toBe(true);
        await destructiveToggle.click();
        expect(await destructiveToggle.isSelected()).toBe(false);
    });

    it("consulta, filtra, repite y vacía el historial local", async () => {
        await openWorkspace("Historial");
        await $(".history-item").waitForDisplayed();
        const initialEntries = await $$(".history-item").length;
        expect(initialEntries).toBeGreaterThanOrEqual(7);

        const filter = await $('[aria-label="Filtrar historial"]');
        await filter.setValue("Variables GET");
        await expect($(".history-item strong")).toHaveText("Variables GET");
        await clickButton("Repetir");
        await browser.waitUntil(
            async () =>
                Number((await $(".history-sidebar .eyebrow").getText()).split("·")[1]) >
                initialEntries,
        );
        await filter.clearValue();

        await $('[aria-label="Vaciar historial"]').click();
        await clickButton("Vaciar historial");
        await browser.waitUntil(async () => (await $$(".history-item").length) === 0);
        await expect($(".history-details--empty")).toBeDisplayed();
    });

    it("crea, ejecuta y elimina un monitor local", async () => {
        await openWorkspace("Monitores");
        await $('[aria-label="Nuevo monitor"]').click();
        const dialog = await $(".monitor-dialog");
        await dialog.$("input").setValue("Monitor WebView");
        await dialog.$("select").selectByVisibleText("GET · Health check");
        await clickButton("Crear monitor");
        await browser.waitUntil(() =>
            readdirSync(join(projectRoot, "monitors"))
                .filter((file) => file.endsWith(".json"))
                .some(
                    (file) =>
                        (
                            JSON.parse(
                                readFileSync(join(projectRoot, "monitors", file), "utf8"),
                            ) as { name?: string }
                        ).name === "Monitor WebView",
                ),
        );
        // The empty workspace's h1 is replaced by an article after creation; re-query it.
        await browser.waitUntil(
            async () => (await $(".monitor-workspace h1").getText()) === "Monitor WebView",
        );
        await expect($(".monitor-workspace h1")).toHaveText("Monitor WebView");

        await clickButton("Ejecutar ahora");
        await browser.waitUntil(
            async () => (await $(".monitor-card--runtime").getText()).includes("HTTP 200"),
            {
                timeout: 30_000,
            },
        );
        await expect($(".monitor-card--runtime")).toHaveText(expect.stringContaining("1"));

        await clickButton("Eliminar");
        await clickButton("Eliminar monitor");
        await browser.waitUntil(async () => (await $$(".monitor-item").length) === 0);
    });

    it("administra MongoDB local desde la interfaz: colección, alta, edición y borrado", async () => {
        await openWorkspace("MongoDB Explorer");
        await expect($(".mongodb-page h1")).toHaveText("MongoDB");
        await clickButton("Iniciar local");
        await button("Nueva colección").waitForDisplayed({ timeout: 120_000 });

        await clickButton("Nueva colección");
        const fields = await $$(".namespace-dialog input");
        await fields[0].setValue("nexora_e2e");
        await fields[1].setValue("items");
        await clickButton("Crear colección");
        await button("Insertar").waitForEnabled();

        await clickButton("Insertar");
        const documentEditor = await $('[aria-label="Documento JSON"]');
        await documentEditor.setValue('{"name":"webview","count":1}');
        await clickButton("Guardar");
        await expect($(".document-card .code-viewer")).toHaveText(
            expect.stringContaining('"count": 1'),
        );
        expect(await $$(".document-card .code-viewer__number").length).toBeGreaterThan(1);
        expect(await $$(".document-card .syntax-token--key").length).toBeGreaterThan(1);

        await clickButton("Esquema");
        await expect($(".mongo-schema")).toHaveText(expect.stringContaining("name"));
        await clickButton("Índices");
        await $(".mongo-index-card").waitForDisplayed({ timeout: 30_000 });
        await expect($(".mongo-index-card")).toHaveText(expect.stringContaining("_id_"));
        await clickButton("Documentos");

        await $('[aria-label="Editar documento"]').click();
        const editEditor = await $('[aria-label="Documento JSON"]');
        await editEditor.setValue(
            (await editEditor.getValue()).replace('"count": 1', '"count": 2'),
        );
        await clickButton("Guardar");
        await expect($(".document-card .code-viewer")).toHaveText(
            expect.stringContaining('"count": 2'),
        );

        await $('[aria-label="Eliminar documento"]').click();
        await browser.waitUntil(async () => !(await $(".document-card").isExisting()));
        await clickButton("Desconectar");
        await expect($(".mongodb-page h1")).toHaveText("MongoDB");
    });

    it("administra PostgreSQL local y ejecuta lectura y escritura confirmada", async () => {
        await openWorkspace("PostgreSQL Studio");
        await button("Iniciar servidor local").waitForEnabled({ timeout: 30_000 });
        await clickButton("Iniciar servidor local");
        const sql = await $('[aria-label="Consulta PostgreSQL"]');
        await sql.waitForDisplayed({ timeout: 180_000 });

        await sql.setValue("SELECT 41 + 1 AS answer;");
        expect(await $$(".sql-editor .syntax-token--keyword").length).toBeGreaterThanOrEqual(2);
        await clickButton("Ejecutar");
        await expect($(".sql-results")).toHaveText(expect.stringContaining("42"));
        await (await button("Exportar CSV")).waitForEnabled();

        await runWritableSql(
            "CREATE TABLE webview_items (id integer PRIMARY KEY, name text NOT NULL);",
        );
        await expect($(".result-empty h2")).toHaveText("Sentencia completada");
        await runWritableSql("INSERT INTO webview_items (id, name) VALUES (1, 'Nexora');");

        await sql.setValue("SELECT id, name FROM webview_items ORDER BY id;");
        await clickButton("Ejecutar");
        await expect($(".sql-results")).toHaveText(expect.stringContaining("Nexora"));
        await clickButton("Detener PostgreSQL local");
        await button("Iniciar servidor local").waitForDisplayed({ timeout: 60_000 });
    });

    it("guarda antes de abrir un clon y aísla sus variables aunque comparta el id del proyecto", async () => {
        const cloneRoot = join(projectRoot, "cloned-project");
        createProjectFixture(cloneRoot, "Nexora WebView Clone");
        const readProjectId = (root: string) =>
            (
                JSON.parse(readFileSync(join(root, ".nexora", "project.json"), "utf8")) as {
                    id: string;
                }
            ).id;
        expect(readProjectId(cloneRoot)).toBe(readProjectId(projectRoot));

        await openWorkspace("Variables de sesión");
        await addSessionVariable("privateSession", "fixture-secret-not-persisted");
        await openWorkspace("API Client");
        await openRequest("Health check");
        const pendingUrl = `${E2E_API_URL}/health?project-flush=1`;
        await installIpcGate("health", cloneRoot);
        try {
            await $('[aria-label="URL de la petición"]').setValue(pendingUrl);
            await waitForHeldSave();
            await openProjectFromFooter();
            await $(".loading-screen").waitForDisplayed();
            expect((await ipcGateState()).openProjectCalls).toBe(0);
            await releaseHeldSave();
            await $(".loading-screen").waitForExist({ reverse: true, timeout: 30_000 });
            await expect($(".status-bar")).toHaveText(
                expect.stringContaining("Nexora WebView Clone"),
            );
            expect(readSavedRequest(projectRoot, "general", "health").url).toBe(pendingUrl);
            await openWorkspace("Variables de sesión");
            expect(await $$('[aria-label="Nombre de variable"]').length).toBe(0);
            expect(readSavedRequest(cloneRoot, "general", "health").url).toBe("{{baseUrl}}/health");
        } finally {
            await restoreIpcGate();
            await installIpcGate(null, projectRoot);
            try {
                await openProjectFromFooter();
                await $(".loading-screen").waitForExist({ reverse: true, timeout: 30_000 });
                await expect($(".status-bar")).toHaveText(
                    expect.stringContaining("Nexora WebView E2E"),
                );
            } finally {
                await restoreIpcGate();
            }
        }
        await openWorkspace("API Client");
        await openRequest("Health check");
        await sendAndExpect(200);
        const artifacts = resolve("artifacts", "e2e");
        mkdirSync(artifacts, { recursive: true });
        await browser.saveScreenshot(join(artifacts, "nexora-2.0-shell.png"));
    });

    it("no programa monitores importados sin permiso y lo revoca al pausar, clonar o reabrir", async () => {
        const importedRoot = join(projectRoot, "untrusted-monitors");
        const clonedRoot = join(projectRoot, "untrusted-monitors-clone");
        const probeKey = `scheduling-${Date.now()}`;
        createScheduledProjectFixture(importedRoot, "Monitores sin autorización", probeKey);
        createScheduledProjectFixture(clonedRoot, "Clon sin autorización", probeKey);
        const monitorFile = join(importedRoot, "monitors", "monitor-consent.json");
        const originalDefinition = readFileSync(monitorFile, "utf8");
        const count = async () => {
            const response = await fetch(`${E2E_API_URL}/monitor-probe?key=${probeKey}`);
            return ((await response.json()) as { count: number }).count;
        };
        async function openFixture(root: string, name: string) {
            await installIpcGate(null, root);
            try {
                await openProjectFromFooter();
                await browser.waitUntil(async () => (await ipcGateState()).openProjectCalls === 1);
                await $(".loading-screen").waitForExist({ reverse: true, timeout: 30_000 });
                await expect($(".status-bar")).toHaveText(expect.stringContaining(name));
                await openWorkspace("Monitores");
            } finally {
                await restoreIpcGate();
            }
        }
        try {
            await openFixture(importedRoot, "Monitores sin autorización");
            await button("Iniciar programación").waitForDisplayed();
            await browser.pause(11_000);
            expect(await count()).toBe(0);
            // Manual execution remains an explicit, independent action while scheduling is paused.
            await clickButton("Ejecutar ahora");
            await browser.waitUntil(async () => (await count()) === 1);
            await button("Iniciar programación").waitForDisplayed();
            await clickButton("Iniciar programación");
            await browser.waitUntil(async () => (await count()) >= 2, { timeout: 16_000 });
            await clickButton("Pausar programación");
            const pausedCount = await count();
            await browser.pause(11_000);
            expect(await count()).toBe(pausedCount);
            expect(readFileSync(monitorFile, "utf8")).toBe(originalDefinition);

            await clickButton("Iniciar programación");
            await openFixture(clonedRoot, "Clon sin autorización");
            await button("Iniciar programación").waitForDisplayed();
            await browser.pause(11_000);
            expect(await count()).toBe(pausedCount);
            await clickButton("Iniciar programación");
            await openFixture(clonedRoot, "Clon sin autorización");
            await button("Iniciar programación").waitForDisplayed();
            await browser.pause(11_000);
            expect(await count()).toBe(pausedCount);
        } finally {
            await installIpcGate(null, projectRoot);
            try {
                await openProjectFromFooter();
                await expect($(".status-bar")).toHaveText(
                    expect.stringContaining("Nexora WebView E2E"),
                );
                await $(".loading-screen").waitForExist({ reverse: true, timeout: 30_000 });
            } finally {
                await restoreIpcGate();
            }
        }
    });
});

async function addSessionVariable(key: string, value: string) {
    await clickButton("Añadir variable");
    const keyInputs = await $$('[aria-label="Nombre de variable"]');
    const keyInput = keyInputs[(await keyInputs.length) - 1];
    await keyInput.setValue(key);
    const valueInput = await $(`[aria-label="Valor de ${key}"]`);
    await valueInput.setValue(value);
}

async function openWorkspace(label: string) {
    await $(`[aria-label="${label}"]`).click();
    await browser.waitUntil(
        async () => (await $(`[aria-label="${label}"]`).getAttribute("aria-current")) === "page",
    );
}

async function openRequest(name: string) {
    const request = await button(name);
    if (!(await request.isDisplayed())) {
        const folder =
            name === "Variables GET" || name === "Health check" ? "General" : "Mutaciones";
        const trigger = await button(folder);
        if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    }
    await (await button(name)).click();
    await browser.waitUntil(
        async () => (await $('.request-tab[data-active="true"]').getText()).includes(name),
        {
            timeout: 20_000,
            timeoutMsg: `No se activó la petición ${name}`,
        },
    );
}

async function sendAndExpect(status: number) {
    await clickButton("Enviar");
    await browser.waitUntil(
        async () => (await $(".response-result__meta strong").getText()).startsWith(String(status)),
        { timeout: 30_000 },
    );
    expect(await $(".response-result__meta").getText()).toMatch(/\d+ ms/);
}

async function runWritableSql(statement: string) {
    const sql = await $('[aria-label="Consulta PostgreSQL"]');
    await sql.setValue(statement);
    await clickButton("Ejecutar");
    await button("Ejecutar").waitForClickable({ timeout: 60_000 });
}

async function clickElement(selector: string) {
    const clicked = await browser.execute((targetSelector: string) => {
        const target = document.querySelector<HTMLElement>(targetSelector);
        target?.click();
        return Boolean(target);
    }, selector);
    expect(clicked).toBe(true);
}

async function openRequestContextAction(requestName: string, actionName: string) {
    const actionExecuted = await browser.executeAsync(
        (targetName: string, targetAction: string, done: (result: boolean) => void) => {
            const request = [
                ...document.querySelectorAll<HTMLButtonElement>(".request-tree-item"),
            ].find((candidate) => candidate.textContent?.includes(targetName));
            if (!request) {
                done(false);
                return;
            }

            request.dispatchEvent(
                new MouseEvent("contextmenu", {
                    bubbles: true,
                    button: 2,
                    clientX: 180,
                    clientY: 240,
                }),
            );
            window.setTimeout(() => {
                const action = [
                    ...document.querySelectorAll<HTMLButtonElement>(
                        ".request-context-menu [role='menuitem']",
                    ),
                ].find((candidate) => candidate.textContent?.includes(targetAction));
                action?.click();
                done(Boolean(action));
            }, 50);
        },
        requestName,
        actionName,
    );

    expect(actionExecuted).toBe(true);
}

function button(label: string) {
    const literal = xpathLiteral(label);
    return $(
        `//div[contains(concat(' ', normalize-space(@class), ' '), ' workspace-view ') and @data-active='true']//button[normalize-space(.)=${literal} or .//*[normalize-space(.)=${literal}]]`,
    );
}

function buttonOnPage(label: string) {
    return $(
        `//button[normalize-space(.)=${xpathLiteral(label)} or .//*[normalize-space(.)=${xpathLiteral(label)}]]`,
    );
}

function requestTreeItem(label: string) {
    return $(
        `//aside[contains(concat(' ', normalize-space(@class), ' '), ' api-sidebar ')]//button[contains(concat(' ', normalize-space(@class), ' '), ' request-tree-item ') and .//*[normalize-space(.)=${xpathLiteral(label)}]]`,
    );
}

async function clickButton(label: string) {
    const target = await button(label);
    await target.waitForClickable();
    await target.click();
}

function findSavedRequestByName(name: string, required = true) {
    const requestRoot = join(projectRoot, "requests");
    for (const folder of readdirSync(requestRoot, { withFileTypes: true })) {
        if (!folder.isDirectory()) continue;
        for (const file of readdirSync(join(requestRoot, folder.name))) {
            if (!file.endsWith(".json")) continue;
            const value = JSON.parse(
                readFileSync(join(requestRoot, folder.name, file), "utf8"),
            ) as {
                id?: string;
                name?: string;
                url?: string;
            };
            if (value.name === name) return value;
        }
    }
    if (required) throw new Error(`No se encontró la petición guardada ${name}`);
    return null;
}

function xpathLiteral(value: string) {
    if (!value.includes('"')) return `"${value}"`;
    if (!value.includes("'")) return `'${value}'`;
    return `concat(${value
        .split('"')
        .map((part) => `"${part}"`)
        .join(", '\"', ")})`;
}

function requiredEnvironment(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Falta ${name} para la suite E2E`);
    return value;
}

async function stopLocalRuntime(workspace: string, selector: string) {
    try {
        await openWorkspace(workspace);
        const buttonToStop = await $(`.workspace-view[data-active="true"] ${selector}`);
        if (await buttonToStop.isDisplayed()) {
            await buttonToStop.click();
            await buttonToStop.waitForExist({ reverse: true, timeout: 60_000 });
        }
    } catch {
        // La limpieza del siguiente runtime todavía debe intentarse.
    }
}

type IpcGateWindow = Window & {
    __NEXORA_E2E_IPC_GATE__?: {
        completedSaves: number;
        destroyCalls: number;
        held: boolean;
        openProjectCalls: number;
        releaseSave?: () => void;
        restore: () => void;
        saveCalls: number;
    };
};

// Delay only the selected save; every persistence command still reaches the real Rust backend.
// The native folder picker is substituted so a controlled fixture can be opened unattended.
async function installIpcGate(
    requestId: string | null,
    selectedRoot: string | null = null,
    preserveWindow = false,
) {
    await browser.execute(
        (targetId: string | null, root: string | null, preserve: boolean) => {
            const target = window as unknown as IpcGateWindow;
            if (target.__NEXORA_E2E_IPC_GATE__)
                throw new Error("Ya hay una barrera IPC E2E instalada");
            const original = window.fetch;
            const gate: NonNullable<IpcGateWindow["__NEXORA_E2E_IPC_GATE__"]> = {
                completedSaves: 0,
                destroyCalls: 0,
                held: false,
                openProjectCalls: 0,
                saveCalls: 0,
                restore: () => {
                    gate.releaseSave?.();
                    window.fetch = original;
                    delete target.__NEXORA_E2E_IPC_GATE__;
                },
            };
            target.__NEXORA_E2E_IPC_GATE__ = gate;
            // Tauri defines invoke as non-writable. Its documented custom IPC protocol uses
            // fetch, which can be delayed without modifying production code or native commands.
            const intercept = async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = new URL(
                    typeof input === "string"
                        ? input
                        : input instanceof URL
                          ? input.href
                          : input.url,
                );
                if (url.hostname !== "ipc.localhost") return original(input, init);
                const command = decodeURIComponent(url.pathname.slice(1));
                const args =
                    typeof init?.body === "string"
                        ? (JSON.parse(init.body) as Record<string, unknown>)
                        : undefined;
                if (command === "plugin:dialog|open" && root !== null) {
                    return Response.json(root, { headers: { "Tauri-Response": "ok" } });
                }
                if (command === "plugin:window|destroy" && preserve) {
                    // CloseRequested and saves are real; keep the final WebView alive for DB cleanup.
                    gate.destroyCalls++;
                    return Response.json(null, { headers: { "Tauri-Response": "ok" } });
                }
                if (command === "open_project") gate.openProjectCalls++;
                const request = args?.request as { id?: string } | undefined;
                if (command === "save_request" && targetId !== null && request?.id === targetId) {
                    gate.saveCalls++;
                    if (gate.saveCalls === 1) {
                        gate.held = true;
                        await new Promise<void>((done) => {
                            gate.releaseSave = () => {
                                gate.held = false;
                                done();
                            };
                        });
                    }
                    const result = await original(input, init);
                    gate.completedSaves++;
                    return result;
                }
                return original(input, init);
            };
            window.fetch = intercept as typeof window.fetch;
            if (window.fetch !== intercept)
                throw new Error("No se pudo instrumentar el transporte IPC E2E");
        },
        requestId,
        selectedRoot,
        preserveWindow,
    );
}

async function ipcGateState() {
    return browser.execute(() => {
        const gate = (window as unknown as IpcGateWindow).__NEXORA_E2E_IPC_GATE__;
        if (!gate) throw new Error("No hay barrera IPC E2E");
        return {
            completedSaves: gate.completedSaves,
            destroyCalls: gate.destroyCalls,
            held: gate.held,
            openProjectCalls: gate.openProjectCalls,
        };
    });
}

async function waitForHeldSave() {
    await browser.waitUntil(async () => (await ipcGateState()).held, { timeout: 15_000 });
}

async function releaseHeldSave() {
    await browser.execute(() => {
        (window as unknown as IpcGateWindow).__NEXORA_E2E_IPC_GATE__?.releaseSave?.();
    });
}

async function restoreIpcGate() {
    await browser.execute(() => {
        (window as unknown as IpcGateWindow).__NEXORA_E2E_IPC_GATE__?.restore();
    });
}

async function openProjectFromFooter() {
    await $(".status-bar__project-trigger").click();
    await $(".status-bar__project-menu button").click();
}

async function setConfirmResponse(response: boolean | null) {
    await browser.execute((answer: boolean | null) => {
        const target = window as Window & { __NEXORA_E2E_CONFIRM__?: typeof window.confirm };
        if (answer === null) {
            if (target.__NEXORA_E2E_CONFIRM__) window.confirm = target.__NEXORA_E2E_CONFIRM__;
            delete target.__NEXORA_E2E_CONFIRM__;
            return;
        }
        target.__NEXORA_E2E_CONFIRM__ ??= window.confirm;
        window.confirm = () => answer;
    }, response);
}

expect(existsSync(join(projectRoot, ".nexora"))).toBe(true);
expect(existsSync(join(projectRoot, "folders"))).toBe(true);
expect(existsSync(join(projectRoot, "monitors"))).toBe(true);
expect(existsSync(join(projectRoot, "requests"))).toBe(true);
expect(existsSync(join(projectRoot, ".nexora", "requests"))).toBe(false);
expect(readSavedRequest(projectRoot, "general", "health").method).toBe("GET");

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { E2E_API_URL, readSavedRequest } from "../support/fixture";

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
        const body = await $(".response-result pre").getText();
        expect(body).toContain('"authorization": "Bearer nexora-e2e-token"');
        expect(body).toContain('"mode": "webview"');
        expect(body).toContain('"testHeader": "webview"');
        await clickElement(".response-panel .panel-tabs button:nth-child(2)");
        await expect($(".response-result pre")).toHaveText(expect.stringContaining("x-nexora-e2e"));

        const scenarios = [
            ["Echo POST", 201],
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
        await expect($(".document-card pre")).toHaveText(expect.stringContaining('"count": 1'));

        await $('[aria-label="Editar documento"]').click();
        const editEditor = await $('[aria-label="Documento JSON"]');
        await editEditor.setValue(
            (await editEditor.getValue()).replace('"count": 1', '"count": 2'),
        );
        await clickButton("Guardar");
        await expect($(".document-card pre")).toHaveText(expect.stringContaining('"count": 2'));

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
        await clickButton("Ejecutar");
        await expect($(".sql-results")).toHaveText(expect.stringContaining("42"));

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
    await expect($('.request-tab[data-active="true"]')).toHaveText(expect.stringContaining(name));
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
    const requestRoot = join(projectRoot, ".nexora", "requests");
    for (const folder of readdirSync(requestRoot, { withFileTypes: true })) {
        if (!folder.isDirectory()) continue;
        for (const file of readdirSync(join(requestRoot, folder.name))) {
            if (!file.endsWith(".json")) continue;
            const value = JSON.parse(
                readFileSync(join(requestRoot, folder.name, file), "utf8"),
            ) as {
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

expect(existsSync(join(projectRoot, ".nexora"))).toBe(true);
expect(readSavedRequest(projectRoot, "general", "health").method).toBe("GET");

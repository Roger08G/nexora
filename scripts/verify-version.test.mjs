import assert from "node:assert/strict";
import { test } from "node:test";
import { readVersionSources, verifyVersionSources } from "./verify-version.mjs";

const sources = readVersionSources();
const version = JSON.parse(sources["package.json"]).version;
const changedVersion = `${Number(version.split(".")[0]) + 1}.0.0`;

function withJson(file, patch) {
    return { ...sources, [file]: JSON.stringify({ ...JSON.parse(sources[file]), ...patch }) };
}

test("la versión del repositorio coincide en manifiestos, lockfile y frontend", () => {
    assert.equal(verifyVersionSources(sources), version);
});

test("rechaza un nombre de paquete diferente", () => {
    assert.throws(() => verifyVersionSources(withJson("package.json", { name: "other" })));
});

test("rechaza una versión ausente, no textual o inválida", () => {
    for (const invalid of [undefined, 2, "2.2", "v2.2.0", "02.2.0", "2.2.0-", "2.2.0+."]) {
        assert.throws(() => verifyVersionSources(withJson("package.json", { version: invalid })));
    }
});

for (const file of ["src-tauri/Cargo.toml", "src-tauri/Cargo.lock"]) {
    test(`detecta una versión distinta de Nexora en ${file}`, () => {
        const source = sources[file].replace(
            /name = "nexora"\r?\nversion = "[^"]+"/,
            `name = "nexora"\nversion = "${changedVersion}"`,
        );
        assert.notEqual(source, sources[file]);
        assert.throws(() => verifyVersionSources({ ...sources, [file]: source }));
    });
}

test("detecta una entrada Nexora duplicada en Cargo.lock", () => {
    const duplicate = `${sources["src-tauri/Cargo.lock"]}\n[[package]]\nname = "nexora"\nversion = "${version}"\n`;
    assert.throws(() => verifyVersionSources({ ...sources, "src-tauri/Cargo.lock": duplicate }));
});

test("no confunde la versión de una dependencia con la versión de la aplicación", () => {
    const anotherPackage = `${sources["src-tauri/Cargo.lock"]}\n[[package]]\nname = "unrelated-test-package"\nversion = "${changedVersion}"\n`;
    assert.equal(
        verifyVersionSources({ ...sources, "src-tauri/Cargo.lock": anotherPackage }),
        version,
    );
});

for (const file of [
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.release.conf.json",
    "src-tauri/tauri.e2e.conf.json",
]) {
    test(`detecta una versión distinta en ${file}`, () => {
        assert.throws(() => verifyVersionSources(withJson(file, { version: changedVersion })));
    });
}

test("permite una versión coincidente en una configuración extendida", () => {
    assert.equal(
        verifyVersionSources(withJson("src-tauri/tauri.release.conf.json", { version })),
        version,
    );
});

test("rechaza una versión de frontend fijada manualmente en Vite", () => {
    const manualVersion = sources["vite.config.ts"].replace(
        "JSON.stringify(appVersion)",
        `JSON.stringify("${version}")`,
    );
    assert.throws(() => verifyVersionSources({ ...sources, "vite.config.ts": manualVersion }));
});

test("rechaza una fuente alternativa para la versión de Vite", () => {
    const wrongSource = sources["vite.config.ts"].replace("./package.json", "./other.json");
    assert.throws(() => verifyVersionSources({ ...sources, "vite.config.ts": wrongSource }));
});

test("detecta la declaración global de frontend ausente", () => {
    assert.throws(() => verifyVersionSources({ ...sources, "src/vite-env.d.ts": "" }));
});

test("detecta una versión fijada manualmente en la pantalla inicial", () => {
    const file = "src/modules/projects/page.tsx";
    assert.throws(() =>
        verifyVersionSources({ ...sources, [file]: `${sources[file]}\n// v${version}` }),
    );
});

test("detecta una pantalla inicial que deja de consumir la versión de Vite", () => {
    const file = "src/modules/projects/page.tsx";
    assert.throws(() =>
        verifyVersionSources({
            ...sources,
            [file]: sources[file].replace("{__APP_VERSION__}", '{"desarrollo"}'),
        }),
    );
});

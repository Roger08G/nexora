import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const versionFiles = [
    "package.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.release.conf.json",
    "src-tauri/tauri.e2e.conf.json",
    "vite.config.ts",
    "src/vite-env.d.ts",
    "src/modules/projects/page.tsx",
];
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function readVersionSources(root = repositoryRoot) {
    return Object.fromEntries(
        versionFiles.map((file) => [file, readFileSync(resolve(root, file), "utf8")]),
    );
}

function tomlString(section, key, file) {
    const values = [...section.matchAll(new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, "gm"))];
    assert.equal(values.length, 1, `${file}: debe existir un único ${key}.`);
    return values[0][1];
}

export function verifyVersionSources(sources) {
    const packageJson = JSON.parse(sources["package.json"]);
    assert.equal(packageJson.name, "nexora", "package.json: nombre de aplicación inesperado.");
    const version = packageJson.version;
    assert.equal(typeof version, "string", "package.json: falta la versión de la aplicación.");
    assert.match(version, semver, "package.json: la versión debe cumplir major.minor.patch.");

    const cargoPackage = sources["src-tauri/Cargo.toml"]
        .split(/(?=^\[)/m)
        .find((section) => /^\[package\]\s*$/m.test(section));
    assert.ok(cargoPackage, "Cargo.toml: falta la sección [package].");
    assert.equal(tomlString(cargoPackage, "name", "Cargo.toml"), packageJson.name);
    assert.equal(
        tomlString(cargoPackage, "version", "Cargo.toml"),
        version,
        "Cargo.toml: versión distinta de package.json.",
    );

    const lockedPackages = sources["src-tauri/Cargo.lock"]
        .split(/^\[\[package\]\]\s*$/m)
        .slice(1)
        .filter((section) => tomlString(section, "name", "Cargo.lock") === packageJson.name);
    assert.equal(lockedPackages.length, 1, "Cargo.lock: debe existir una única entrada Nexora.");
    assert.equal(
        tomlString(lockedPackages[0], "version", "Cargo.lock"),
        version,
        "Cargo.lock: la versión de Nexora no coincide con package.json.",
    );

    assert.equal(
        JSON.parse(sources["src-tauri/tauri.conf.json"]).version,
        version,
        "tauri.conf.json: versión distinta de package.json.",
    );
    for (const file of ["src-tauri/tauri.release.conf.json", "src-tauri/tauri.e2e.conf.json"]) {
        const override = JSON.parse(sources[file]);
        assert.ok(
            override.version === undefined || override.version === version,
            `${file}: sobrescribe la versión con un valor distinto.`,
        );
    }

    const viteConfig = sources["vite.config.ts"];
    assert.match(
        viteConfig,
        /\{\s*version:\s*appVersion\s*\}\s*=\s*JSON\.parse\(/,
        "Vite: appVersion debe proceder de package.json.",
    );
    assert.match(
        viteConfig,
        /readFileSync\(\s*new URL\(\s*["']\.\/package\.json["']\s*,\s*import\.meta\.url\s*\)\s*,\s*["']utf8["']\s*\)/,
        "Vite: debe leer package.json del repositorio, no una variable de entorno.",
    );
    assert.match(
        viteConfig,
        /__APP_VERSION__\s*:\s*JSON\.stringify\(\s*appVersion\s*\)/,
        "Vite: falta la inyección de __APP_VERSION__ desde package.json.",
    );
    assert.match(
        sources["src/vite-env.d.ts"],
        /declare\s+const\s+__APP_VERSION__\s*:\s*string\s*;/,
        "Frontend: falta la declaración de __APP_VERSION__.",
    );
    const startPage = sources["src/modules/projects/page.tsx"];
    assert.match(
        startPage,
        /\{\s*__APP_VERSION__\s*\}/,
        "Pantalla inicial: debe mostrar la versión inyectada por Vite.",
    );
    assert.doesNotMatch(
        startPage,
        /\bv?\d+\.\d+\.\d+(?:[-+][\da-zA-Z.-]+)?\b/,
        "Pantalla inicial: no debe contener una versión escrita manualmente.",
    );
    return version;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try {
        const version = verifyVersionSources(readVersionSources());
        console.info(`Versión ${version}: manifiestos, Cargo.lock y frontend coherentes.`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}

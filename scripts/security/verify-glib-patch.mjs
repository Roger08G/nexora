import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const vendorPath = "src-tauri/vendor/glib-0.18.5";
const harnessPath = "scripts/security/glib-variant-iter";
const provenancePath = "scripts/security/glib-backport.json";
const originalInventorySha256 = "d23bee213f3bb426733c2340fd415561dea1bd26d76b551e520d47265de24d3c";
const originalVariantSha256 = "1fd02859333761c45321b32f28b24233446b97d0022a90d3a937ed162585b90e";
const patchedVariantSha256 = "a0f5ee8acb8faa089bcdfbc9a57372609fce7654026ccef7d9a224d05a654ccc";
const maximumFileBytes = 16 * 1024 * 1024;

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

function safeRelativePath(path) {
    assert.equal(typeof path, "string", "La ruta debe ser texto.");
    assert.ok(path.length > 0 && !isAbsolute(path), "La ruta debe ser relativa.");
    assert.ok(!/[\\:\0]/.test(path), `Ruta no portable: ${path}`);
    assert.ok(
        path.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
        `Ruta no normalizada: ${path}`,
    );
    return path;
}

function plainPath(root, path) {
    safeRelativePath(path);
    let current = resolve(root);
    assert.ok(!lstatSync(current).isSymbolicLink(), "La raíz no puede ser un enlace.");
    const parts = path.split("/");
    for (let index = 0; index < parts.length; index += 1) {
        current = resolve(current, parts[index]);
        const stat = lstatSync(current);
        assert.ok(!stat.isSymbolicLink(), `No se permiten enlaces: ${path}`);
        if (index < parts.length - 1) {
            assert.ok(stat.isDirectory(), `Directorio esperado: ${path}`);
        }
    }
    return current;
}

function plainFile(root, path, limit = maximumFileBytes) {
    const absolute = plainPath(root, path);
    const stat = lstatSync(absolute);
    assert.ok(stat.isFile(), `Archivo regular esperado: ${path}`);
    assert.ok(stat.size <= limit, `Archivo demasiado grande: ${path}`);
    return readFileSync(absolute);
}

function readText(root, path) {
    return plainFile(root, path).toString("utf8");
}

function inventory(root) {
    const files = [];
    const directories = [];
    function visit(path) {
        for (const entry of readdirSync(plainPath(root, path), { withFileTypes: true })) {
            const child = `${path}/${entry.name}`;
            const stat = lstatSync(plainPath(root, child));
            assert.ok(!stat.isSymbolicLink(), `No se permiten enlaces: ${child}`);
            if (stat.isDirectory()) {
                directories.push(child.slice(vendorPath.length + 1));
                visit(child);
            } else {
                assert.ok(stat.isFile(), `Entrada no regular: ${child}`);
                files.push(child.slice(vendorPath.length + 1));
            }
        }
    }
    visit(vendorPath);
    return { files: files.sort(), directories: directories.sort() };
}

function section(text, name, file) {
    const sections = text.split(/(?=^\[)/m);
    const matches = sections.filter((entry) => entry.split(/\r?\n/, 1)[0].trim() === `[${name}]`);
    assert.equal(matches.length, 1, `${file}: se esperaba una única sección [${name}].`);
    return matches[0];
}

function tomlString(text, key, file) {
    const matches = [...text.matchAll(new RegExp(`^${key}\\s*=\\s*"([^"\\r\\n]+)"\\s*$`, "gm"))];
    assert.equal(matches.length, 1, `${file}: se esperaba un único ${key}.`);
    return matches[0][1];
}

function isAffectedGlib(version) {
    // A prerelease is not evidence of an upstream fix; require a reviewed stable version.
    const match = /^(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
    assert.ok(match, `Versión GLib no reconocida: ${version}`);
    return Number(match[1]) === 0 && Number(match[2]) >= 15 && Number(match[2]) < 20;
}

function verifyLock(root, path) {
    const packages = readText(root, path)
        .split(/^\[\[package\]\]\s*$/m)
        .slice(1)
        .filter((entry) => /^name\s*=\s*"glib"\s*$/m.test(entry));
    const affected = packages.filter((entry) => isAffectedGlib(tomlString(entry, "version", path)));
    assert.equal(
        affected.length,
        1,
        `${path}: debe resolverse una única copia GLib afectada por rango.`,
    );
    assert.equal(tomlString(affected[0], "version", path), "0.18.5", `${path}: GLib incorrecto.`);
    assert.ok(
        !/^source\s*=/m.test(affected[0]),
        `${path}: GLib 0.18.5 debe provenir del vendor local.`,
    );
    assert.ok(
        !/^checksum\s*=/m.test(affected[0]),
        `${path}: checksum de registro obsoleto en GLib local.`,
    );
}

function verifyManifests(root) {
    const appManifest = readText(root, "src-tauri/Cargo.toml");
    const patch = section(appManifest, "patch.crates-io", "src-tauri/Cargo.toml");
    assert.match(
        patch,
        /^glib\s*=\s*\{\s*path\s*=\s*"vendor\/glib-0\.18\.5"\s*\}\s*$/m,
        "Nexora debe usar el backport GLib local mediante [patch.crates-io].",
    );
    const workspace = section(appManifest, "workspace", "src-tauri/Cargo.toml");
    assert.match(workspace, /^exclude\s*=\s*\[[^\]]*"vendor\/glib-0\.18\.5"[^\]]*\]/m);
    const harnessManifest = readText(root, `${harnessPath}/Cargo.toml`);
    section(harnessManifest, "workspace", `${harnessPath}/Cargo.toml`);
    assert.match(
        section(harnessManifest, "dependencies", `${harnessPath}/Cargo.toml`),
        /^glib\s*=\s*\{\s*path\s*=\s*"\.\.\/\.\.\/\.\.\/src-tauri\/vendor\/glib-0\.18\.5"\s*\}\s*$/m,
        "El harness debe ejecutar exactamente el mismo vendor que Nexora.",
    );
    const vendorManifest = readText(root, `${vendorPath}/Cargo.toml`);
    const vendorPackage = section(vendorManifest, "package", `${vendorPath}/Cargo.toml`);
    assert.equal(tomlString(vendorPackage, "name", vendorPath), "glib");
    assert.equal(tomlString(vendorPackage, "version", vendorPath), "0.18.5");
    verifyLock(root, "src-tauri/Cargo.lock");
    verifyLock(root, `${harnessPath}/Cargo.lock`);
    assert.match(readText(root, ".prettierignore"), /^src-tauri\/vendor\/\s*$/m);
    assert.match(
        readText(root, ".gitattributes"),
        /^src-tauri\/vendor\/glib-0\.18\.5\/\*\*\s+-text\s*$/m,
    );
}

/** Offline verification of provenance, every vendor byte, and both Cargo selections. */
export function verifyBackport(root = repositoryRoot) {
    const provenance = JSON.parse(readText(root, provenancePath));
    assert.equal(provenance.schemaVersion, 1);
    assert.deepEqual(provenance.crate, { name: "glib", version: "0.18.5", license: "MIT" });
    assert.equal(provenance.source.url, "https://static.crates.io/crates/glib/glib-0.18.5.crate");
    assert.equal(provenance.source.bytes, 267679);
    assert.equal(
        provenance.source.sha256,
        "233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5",
    );
    assert.equal(provenance.source.vcsCommit, "42b9caf98e03ded086362d9653ca58fe94dc8658");
    assert.deepEqual(provenance.backport, {
        advisory: "RUSTSEC-2024-0429",
        githubAdvisory: "GHSA-wrw7-89jp-8q8g",
        upstreamCommit: "05dff0ee696f9bcd8617cd48c4b812d046d440cb",
        upstreamUrl:
            "https://github.com/gtk-rs/gtk-rs-core/commit/05dff0ee696f9bcd8617cd48c4b812d046d440cb",
        pullRequest: "https://github.com/gtk-rs/gtk-rs-core/pull/1343",
        patchFile: "scripts/security/glib-variant-str-iter.patch",
        patchSha256: "9093c570aff2977c50d9153d1f69988bcd1896d9389a79de7319573a8206a1ab",
        file: "src/variant_iter.rs",
        bytes: 9882,
        sha256: patchedVariantSha256,
    });
    assert.equal(
        sha256(plainFile(root, provenance.backport.patchFile)),
        provenance.backport.patchSha256,
        "El archivo patch no coincide con la corrección upstream documentada.",
    );
    const expectedFiles = Object.keys(provenance.source.files).sort();
    const rows = expectedFiles.map((path) => {
        safeRelativePath(path);
        const expected = provenance.source.files[path];
        assert.deepEqual(Object.keys(expected).sort(), ["bytes", "sha256"]);
        assert.ok(Number.isSafeInteger(expected.bytes) && expected.bytes >= 0);
        assert.match(expected.sha256, /^[0-9a-f]{64}$/);
        return [path, expected.bytes, expected.sha256];
    });
    assert.equal(expectedFiles.length, 121, "Inventario del crate oficial incompleto.");
    assert.equal(
        sha256(JSON.stringify(rows)),
        originalInventorySha256,
        "Inventario oficial alterado.",
    );
    const actual = inventory(root);
    assert.deepEqual(actual.files, expectedFiles, "Hay archivos adicionales o ausentes en GLib.");
    const expectedDirectories = new Set();
    for (const path of expectedFiles) {
        const parts = path.split("/");
        for (let index = 1; index < parts.length; index += 1) {
            expectedDirectories.add(parts.slice(0, index).join("/"));
        }
    }
    assert.deepEqual(
        actual.directories,
        [...expectedDirectories].sort(),
        "Directorios GLib inesperados.",
    );
    for (const path of expectedFiles) {
        const patched = path === provenance.backport.file;
        const expected = patched ? provenance.backport : provenance.source.files[path];
        const content = plainFile(root, `${vendorPath}/${path}`, expected.bytes);
        assert.equal(content.length, expected.bytes, `Tamaño alterado: ${path}`);
        assert.equal(sha256(content), expected.sha256, `Contenido alterado: ${path}`);
    }
    const variant = readText(root, `${vendorPath}/${provenance.backport.file}`);
    const unpatched = variant
        .replace(
            "let mut p: *mut libc::c_char = std::ptr::null_mut();",
            "let p: *mut libc::c_char = std::ptr::null_mut();",
        )
        .replace("                &mut p,", "                &p,");
    assert.equal(
        sha256(unpatched),
        originalVariantSha256,
        "El backport no coincide con las dos líneas upstream.",
    );
    verifyManifests(root);
    return {
        files: expectedFiles.length,
        version: provenance.crate.version,
        sha256: patchedVariantSha256,
    };
}

/** Check the resolved graph, not merely the presence of a patched package in metadata. */
export function verifyResolvedMetadata(metadata, manifest, packageName, root = repositoryRoot) {
    const expectedManifest = realpathSync(plainPath(root, manifest));
    const expectedVendor = realpathSync(plainPath(root, `${vendorPath}/Cargo.toml`));
    assert.ok(metadata && Array.isArray(metadata.packages), "Metadata Cargo inválida.");
    assert.equal(
        realpathSync(metadata.workspace_root),
        dirname(expectedManifest),
        "Workspace inesperado.",
    );
    const packages = new Map(metadata.packages.map((entry) => [entry.id, entry]));
    assert.equal(packages.size, metadata.packages.length, "Paquetes duplicados en metadata.");
    const rootPackage = packages.get(metadata.resolve?.root);
    assert.ok(rootPackage && rootPackage.name === packageName, "Raíz del grafo Cargo incorrecta.");
    assert.equal(realpathSync(rootPackage.manifest_path), expectedManifest);
    assert.deepEqual(
        metadata.workspace_members,
        [rootPackage.id],
        "Vendor no debe ser miembro del workspace.",
    );
    const nodes = new Map(metadata.resolve.nodes.map((entry) => [entry.id, entry]));
    assert.equal(nodes.size, metadata.resolve.nodes.length, "Nodos duplicados en metadata.");
    const pending = [rootPackage.id];
    const visited = new Set();
    const affected = [];
    while (pending.length > 0) {
        const id = pending.pop();
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodes.get(id);
        const entry = packages.get(id);
        assert.ok(node && entry, `Nodo no resuelto: ${id}`);
        if (entry.name === "glib" && isAffectedGlib(entry.version)) affected.push(entry);
        assert.ok(Array.isArray(node.deps), `Dependencias no resueltas: ${id}`);
        for (const dependency of node.deps) pending.push(dependency.pkg);
    }
    assert.equal(
        affected.length,
        1,
        "El grafo Linux debe alcanzar una única copia GLib del rango afectado.",
    );
    assert.equal(affected[0].version, "0.18.5");
    assert.equal(
        affected[0].source,
        null,
        "El grafo usa GLib vulnerable del registro o un fork externo.",
    );
    assert.equal(
        realpathSync(affected[0].manifest_path),
        expectedVendor,
        "El grafo no usa el vendor verificado.",
    );
    assert.ok(!relative(resolve(root), expectedVendor).startsWith(`..${sep}`));
    return { package: packageName, glib: affected[0].id };
}

export function verifyCargoMetadata(root = repositoryRoot, cargo = "cargo") {
    const targets = [
        ["src-tauri/Cargo.toml", "nexora"],
        [`${harnessPath}/Cargo.toml`, "nexora-glib-security-regression"],
    ];
    return targets.map(([manifest, packageName]) => {
        const args = [
            "metadata",
            "--manifest-path",
            manifest,
            "--locked",
            "--all-features",
            "--format-version",
            "1",
            "--filter-platform",
            "x86_64-unknown-linux-gnu",
        ];
        const result = spawnSync(cargo, args, {
            cwd: root,
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
            timeout: 5 * 60 * 1000,
            windowsHide: true,
            shell: false,
        });
        if (result.error) throw result.error;
        assert.equal(result.status, 0, `Cargo metadata falló para ${manifest}: ${result.stderr}`);
        return verifyResolvedMetadata(JSON.parse(result.stdout), manifest, packageName, root);
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const args = process.argv.slice(2);
        assert.ok(
            args.length === 0 || (args.length === 1 && args[0] === "--metadata"),
            "Uso: verify-glib-patch.mjs [--metadata]",
        );
        const result = verifyBackport();
        if (args.includes("--metadata")) {
            const graphs = verifyCargoMetadata();
            verifyBackport();
            console.log(
                `GLib: grafos Linux verificados (${graphs.map((entry) => entry.package).join(", ")}).`,
            );
        }
        console.log(
            `GLib ${result.version}: ${result.files} archivos verificados; backport upstream íntegro.`,
        );
    } catch (error) {
        console.error(
            `Verificación GLib fallida: ${error instanceof Error ? error.message : error}`,
        );
        process.exitCode = 1;
    }
}

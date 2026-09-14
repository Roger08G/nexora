import assert from "node:assert/strict";
import {
    cpSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    truncateSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { verifyBackport, verifyResolvedMetadata } from "./verify-glib-patch.mjs";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const vendorPath = "src-tauri/vendor/glib-0.18.5";
const provenancePath = "scripts/security/glib-backport.json";
const variantPath = `${vendorPath}/src/variant_iter.rs`;

function fixture(t) {
    const root = mkdtempSync(join(realpathSync(tmpdir()), "nexora-glib-guard-"));
    t.after(() => {
        assert.equal(dirname(root), realpathSync(dirname(root)));
        assert.ok(basename(root).startsWith("nexora-glib-guard-"));
        assert.ok(!lstatSync(root).isSymbolicLink());
        rmSync(root, { recursive: true, force: true });
    });
    for (const path of [
        vendorPath,
        provenancePath,
        "scripts/security/glib-variant-str-iter.patch",
        "src-tauri/Cargo.toml",
        "src-tauri/Cargo.lock",
        "scripts/security/glib-variant-iter/Cargo.toml",
        "scripts/security/glib-variant-iter/Cargo.lock",
        ".gitattributes",
        ".prettierignore",
    ]) {
        const target = resolve(root, path);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(resolve(repositoryRoot, path), target, { recursive: true, dereference: false });
    }
    return root;
}

function change(root, path, transform) {
    const file = resolve(root, path);
    writeFileSync(file, transform(readFileSync(file, "utf8")));
}

function changeProvenance(root, transform) {
    change(root, provenancePath, (text) => {
        const manifest = JSON.parse(text);
        transform(manifest);
        return JSON.stringify(manifest);
    });
}

function resolvedGraph(root) {
    return {
        workspace_root: resolve(root, "src-tauri"),
        workspace_members: ["nexora-id"],
        packages: [
            {
                id: "nexora-id",
                name: "nexora",
                version: "2.2.1",
                manifest_path: resolve(root, "src-tauri/Cargo.toml"),
                source: null,
            },
            {
                id: "gtk-id",
                name: "gtk",
                version: "0.18.2",
                source: "registry+https://github.com/rust-lang/crates.io-index",
            },
            {
                id: "glib-id",
                name: "glib",
                version: "0.18.5",
                manifest_path: resolve(root, `${vendorPath}/Cargo.toml`),
                source: null,
            },
        ],
        resolve: {
            root: "nexora-id",
            nodes: [
                { id: "nexora-id", deps: [{ pkg: "gtk-id" }] },
                { id: "gtk-id", deps: [{ pkg: "glib-id" }] },
                { id: "glib-id", deps: [] },
            ],
        },
    };
}

function verifyGraph(root, graph) {
    return verifyResolvedMetadata(graph, "src-tauri/Cargo.toml", "nexora", root);
}

test("accepts the official inventory and exact two-line backport", () => {
    assert.equal(verifyBackport().files, 121);
});

test("rejects reverting the mutable pointer declaration", (t) => {
    const root = fixture(t);
    change(root, variantPath, (text) => text.replace("let mut p:", "let p:"));
    assert.throws(() => verifyBackport(root), /Tamaño alterado|Contenido alterado/);
});

test("rejects reverting the mutable pointer argument", (t) => {
    const root = fixture(t);
    change(root, variantPath, (text) =>
        text.replace("                &mut p,", "                &p,"),
    );
    assert.throws(() => verifyBackport(root), /Tamaño alterado|Contenido alterado/);
});

test("rejects same-sized source changes", (t) => {
    const root = fixture(t);
    change(root, variantPath, (text) => text.replace("impl_get", "impl_gef"));
    assert.throws(() => verifyBackport(root), /Contenido alterado/);
});

test("rejects formatter line-ending changes", (t) => {
    const root = fixture(t);
    change(root, variantPath, (text) => text.replaceAll("\n", "\r\n"));
    assert.throws(() => verifyBackport(root), /Archivo demasiado grande/);
});

test("rejects changing the MIT license", (t) => {
    const root = fixture(t);
    change(root, `${vendorPath}/LICENSE`, (text) => text.replace("Permission", "permission"));
    assert.throws(() => verifyBackport(root), /Contenido alterado/);
});

test("rejects missing upstream files", (t) => {
    const root = fixture(t);
    unlinkSync(resolve(root, `${vendorPath}/COPYRIGHT`));
    assert.throws(() => verifyBackport(root), /archivos adicionales o ausentes/);
});

test("rejects extra files, including a lockfile generated inside vendor", (t) => {
    const root = fixture(t);
    writeFileSync(resolve(root, `${vendorPath}/Cargo.lock`), "# unexpected build output\n");
    assert.throws(() => verifyBackport(root), /archivos adicionales o ausentes/);
});

test("rejects unexpected empty directories", (t) => {
    const root = fixture(t);
    mkdirSync(resolve(root, `${vendorPath}/target`));
    assert.throws(() => verifyBackport(root), /Directorios GLib inesperados/);
});

test("rejects rewriting inventory hashes to accept changed sources", (t) => {
    const root = fixture(t);
    changeProvenance(root, (manifest) => {
        manifest.source.files["LICENSE"].sha256 = "a".repeat(64);
    });
    assert.throws(() => verifyBackport(root), /Inventario oficial alterado/);
});

test("rejects a changed crate origin", (t) => {
    const root = fixture(t);
    changeProvenance(root, (manifest) => {
        manifest.source.url = "https://example.invalid/glib.crate";
    });
    assert.throws(() => verifyBackport(root));
});

test("rejects a changed upstream commit", (t) => {
    const root = fixture(t);
    changeProvenance(root, (manifest) => {
        manifest.backport.upstreamCommit = "0".repeat(40);
    });
    assert.throws(() => verifyBackport(root));
});

test("rejects a changed documented upstream patch", (t) => {
    const root = fixture(t);
    change(root, "scripts/security/glib-variant-str-iter.patch", (text) => `${text}\n`);
    assert.throws(() => verifyBackport(root), /archivo patch no coincide/);
});

test("rejects escaping inventory paths before reading them", (t) => {
    const root = fixture(t);
    changeProvenance(root, (manifest) => {
        manifest.source.files["../outside"] = manifest.source.files["LICENSE"];
    });
    assert.throws(() => verifyBackport(root), /Ruta no normalizada/);
});

test("rejects oversized provenance before reading its content", (t) => {
    const root = fixture(t);
    truncateSync(resolve(root, provenancePath), 16 * 1024 * 1024 + 1);
    assert.throws(() => verifyBackport(root), /Archivo demasiado grande/);
});

test("rejects a fabricated fixed GLib version", (t) => {
    const root = fixture(t);
    change(root, `${vendorPath}/Cargo.toml`, (text) =>
        text.replace('version = "0.18.5"', 'version = "0.20.0"'),
    );
    assert.throws(() => verifyBackport(root), /Contenido alterado/);
});

for (const path of ["src-tauri/Cargo.lock", "scripts/security/glib-variant-iter/Cargo.lock"]) {
    test(`rejects registry GLib in ${path}`, (t) => {
        const root = fixture(t);
        change(root, path, (text) =>
            text.replace(
                'name = "glib"\nversion = "0.18.5"',
                'name = "glib"\nversion = "0.18.5"\nsource = "registry+https://github.com/rust-lang/crates.io-index"',
            ),
        );
        assert.throws(() => verifyBackport(root), /vendor local/);
    });
}

test("rejects an additional vulnerable GLib version in the application lockfile", (t) => {
    const root = fixture(t);
    change(
        root,
        "src-tauri/Cargo.lock",
        (text) =>
            `${text}\n[[package]]\nname = "glib"\nversion = "0.19.9"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`,
    );
    assert.throws(() => verifyBackport(root), /única copia GLib/);
});

test("rejects removing the application patch", (t) => {
    const root = fixture(t);
    change(root, "src-tauri/Cargo.toml", (text) =>
        text.replace(
            'glib = { path = "vendor/glib-0.18.5" }',
            'glib = { path = "vendor/other-glib" }',
        ),
    );
    assert.throws(() => verifyBackport(root), /backport GLib local/);
});

test("rejects a harness that tests another copy", (t) => {
    const root = fixture(t);
    change(root, "scripts/security/glib-variant-iter/Cargo.toml", (text) =>
        text.replace(
            'path = "../../../src-tauri/vendor/glib-0.18.5"',
            'path = "../../../src-tauri/vendor/other-glib"',
        ),
    );
    assert.throws(() => verifyBackport(root), /exactamente el mismo vendor/);
});

test("rejects removing byte-preservation attributes", (t) => {
    const root = fixture(t);
    change(root, ".gitattributes", (text) =>
        text.replace("src-tauri/vendor/glib-0.18.5/** -text", ""),
    );
    assert.throws(() => verifyBackport(root));
});

for (const path of [`${vendorPath}/LICENSE`, provenancePath, `${vendorPath}/src/auto`]) {
    test(`rejects a symlink at ${path}`, (t) => {
        const root = fixture(t);
        const source = resolve(root, path);
        const destination = resolve(root, `link-target-${basename(path)}`);
        cpSync(source, destination, { recursive: true });
        const isDirectory = lstatSync(source).isDirectory();
        rmSync(source, { recursive: isDirectory });
        try {
            symlinkSync(destination, source, isDirectory ? "junction" : "file");
        } catch (error) {
            if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
                t.skip("Windows no permite crear este enlace con el token actual.");
                return;
            }
            throw error;
        }
        assert.throws(() => verifyBackport(root), /No se permiten enlaces/);
    });
}

test("accepts an effective transitive path to the verified vendor", (t) => {
    const root = fixture(t);
    assert.equal(verifyGraph(root, resolvedGraph(root)).glib, "glib-id");
});

test("rejects metadata that merely lists an unreachable patched GLib", (t) => {
    const root = fixture(t);
    const graph = resolvedGraph(root);
    graph.resolve.nodes[1].deps = [];
    assert.throws(() => verifyGraph(root, graph), /debe alcanzar/);
});

test("rejects metadata resolving registry GLib instead of the patch", (t) => {
    const root = fixture(t);
    const graph = resolvedGraph(root);
    graph.packages[2].source = "registry+https://github.com/rust-lang/crates.io-index";
    assert.throws(() => verifyGraph(root, graph), /registro o un fork externo/);
});

test("rejects metadata resolving an unverified local copy", (t) => {
    const root = fixture(t);
    const graph = resolvedGraph(root);
    const otherManifest = resolve(root, "other-glib/Cargo.toml");
    mkdirSync(dirname(otherManifest));
    cpSync(resolve(root, `${vendorPath}/Cargo.toml`), otherManifest);
    graph.packages[2].manifest_path = otherManifest;
    assert.throws(() => verifyGraph(root, graph), /no usa el vendor verificado/);
});

test("rejects metadata with vendor accidentally included in the workspace", (t) => {
    const root = fixture(t);
    const graph = resolvedGraph(root);
    graph.workspace_members.push("glib-id");
    assert.throws(() => verifyGraph(root, graph), /no debe ser miembro/);
});

test("rejects metadata with unresolved dependency edges", (t) => {
    const root = fixture(t);
    const graph = resolvedGraph(root);
    graph.resolve.nodes[1].deps.push({ pkg: "missing-id" });
    assert.throws(() => verifyGraph(root, graph), /Nodo no resuelto/);
});

test("rejects metadata reaching a second vulnerable GLib", (t) => {
    const root = fixture(t);
    const graph = resolvedGraph(root);
    graph.packages.push({ ...graph.packages[2], id: "old-glib-id", version: "0.19.0" });
    graph.resolve.nodes.push({ id: "old-glib-id", deps: [] });
    graph.resolve.nodes[1].deps.push({ pkg: "old-glib-id" });
    assert.throws(() => verifyGraph(root, graph), /única copia GLib/);
});

test("does not treat an unreviewed GLib prerelease as an upstream fix", (t) => {
    const root = fixture(t);
    const graph = resolvedGraph(root);
    graph.packages[2].version = "0.20.0-rc.1";
    assert.throws(() => verifyGraph(root, graph), /Versión GLib no reconocida/);
});

test("accepts an additional fixed stable GLib used by another dependency", (t) => {
    const root = fixture(t);
    const graph = resolvedGraph(root);
    graph.packages.push({
        id: "new-glib-id",
        name: "glib",
        version: "0.21.5",
        source: "registry+https://github.com/rust-lang/crates.io-index",
    });
    graph.resolve.nodes.push({ id: "new-glib-id", deps: [] });
    graph.resolve.nodes[1].deps.push({ pkg: "new-glib-id" });
    assert.equal(verifyGraph(root, graph).glib, "glib-id");
});

test("rejects ambiguous duplicate metadata nodes", (t) => {
    const root = fixture(t);
    const graph = resolvedGraph(root);
    graph.resolve.nodes.push({ id: "glib-id", deps: [] });
    assert.throws(() => verifyGraph(root, graph), /Nodos duplicados/);
});

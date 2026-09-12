import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extract from "extract-zip";

const root = await mkdtemp(join(tmpdir(), "nexora-extract-zip-"));
try {
    for (const [index, target] of ["../../escape.txt", "/escape.txt", "inside.txt"].entries()) {
        const archive = join(root, `symlink-${index}.zip`);
        await writeFile(archive, zipArchive([{ name: "link", data: target, symlink: true }]));
        await assert.rejects(
            extract(archive, { dir: join(root, `symlink-${index}`) }),
            /Symlink archive entries are disabled/,
        );
    }

    // Both CVEs: duplicate entries must never follow an archive-planted symlink.
    const archive = join(root, "duplicate.zip");
    const outside = join(root, "outside.txt");
    await writeFile(outside, "unchanged");
    await writeFile(
        archive,
        zipArchive([
            { name: "target", data: "../outside.txt", symlink: true },
            { name: "target", data: "overwritten" },
        ]),
    );
    await assert.rejects(
        extract(archive, { dir: join(root, "duplicate") }),
        /Symlink archive entries are disabled/,
    );
    assert.equal(await readFile(outside, "utf8"), "unchanged");

    // A pre-existing final-component symlink is unsafe too.
    const existingDestination = join(root, "existing");
    await mkdir(existingDestination);
    let supportsSymlinks = true;
    try {
        await symlink(outside, join(existingDestination, "target"), "file");
    } catch (error) {
        if (process.platform !== "win32" || error.code !== "EPERM") throw error;
        supportsSymlinks = false;
        console.info("Symlink existente: omitido, Windows no concede ese privilegio.");
    }
    const validArchive = join(root, "valid.zip");
    await writeFile(validArchive, zipArchive([{ name: "target", data: "regular file" }]));
    if (supportsSymlinks) {
        await assert.rejects(
            extract(validArchive, { dir: existingDestination }),
            /Unsafe archive destination/,
        );
        assert.equal(await readFile(outside, "utf8"), "unchanged");
    }
    const validDestination = join(root, "valid");
    await extract(validArchive, { dir: validDestination });
    assert.equal(await readFile(join(validDestination, "target"), "utf8"), "regular file");
    console.info("extract-zip: regresiones de symlinks y extracción válida correctas.");
} finally {
    await rm(root, { force: true, recursive: true });
}

function zipArchive(entries) {
    const locals = [];
    const centrals = [];
    let localSize = 0;
    for (const entry of entries) {
        const { local, central } = archiveEntry(entry, localSize);
        locals.push(local);
        centrals.push(central);
        localSize += local.length;
    }
    const centralBytes = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    let offset = 0;
    offset = write(end, offset, 4, 0x06054b50);
    offset = write(end, offset, 2, 0);
    offset = write(end, offset, 2, 0);
    offset = write(end, offset, 2, entries.length);
    offset = write(end, offset, 2, entries.length);
    offset = write(end, offset, 4, centralBytes.length);
    offset = write(end, offset, 4, localSize);
    write(end, offset, 2, 0);
    return Buffer.concat([...locals, centralBytes, end]);
}

function archiveEntry({ name, data, symlink = false }, localOffset) {
    const nameBytes = Buffer.from(name);
    const targetBytes = Buffer.from(data);
    const checksum = crc32(targetBytes);
    const local = Buffer.alloc(30 + nameBytes.length + targetBytes.length);
    let offset = 0;
    offset = write(local, offset, 4, 0x04034b50);
    offset = write(local, offset, 2, 20);
    offset = write(local, offset, 2, 0);
    offset = write(local, offset, 2, 0);
    offset = write(local, offset, 2, 0);
    offset = write(local, offset, 2, 0);
    offset = write(local, offset, 4, checksum);
    offset = write(local, offset, 4, targetBytes.length);
    offset = write(local, offset, 4, targetBytes.length);
    offset = write(local, offset, 2, nameBytes.length);
    offset = write(local, offset, 2, 0);
    nameBytes.copy(local, offset);
    targetBytes.copy(local, offset + nameBytes.length);

    const central = Buffer.alloc(46 + nameBytes.length);
    offset = 0;
    offset = write(central, offset, 4, 0x02014b50);
    offset = write(central, offset, 2, (3 << 8) | 20);
    offset = write(central, offset, 2, 20);
    offset = write(central, offset, 2, 0);
    offset = write(central, offset, 2, 0);
    offset = write(central, offset, 2, 0);
    offset = write(central, offset, 2, 0);
    offset = write(central, offset, 4, checksum);
    offset = write(central, offset, 4, targetBytes.length);
    offset = write(central, offset, 4, targetBytes.length);
    offset = write(central, offset, 2, nameBytes.length);
    offset = write(central, offset, 2, 0);
    offset = write(central, offset, 2, 0);
    offset = write(central, offset, 2, 0);
    offset = write(central, offset, 2, 0);
    offset = write(central, offset, 4, ((symlink ? 0o120777 : 0o100644) << 16) >>> 0);
    offset = write(central, offset, 4, localOffset);
    nameBytes.copy(central, offset);

    return { local, central };
}

function write(buffer, offset, bytes, value) {
    if (bytes === 2) buffer.writeUInt16LE(value, offset);
    else buffer.writeUInt32LE(value >>> 0, offset);
    return offset + bytes;
}

function crc32(value) {
    let crc = 0xffffffff;
    for (const byte of value) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

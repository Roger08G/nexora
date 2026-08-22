import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extract from "extract-zip";

const root = await mkdtemp(join(tmpdir(), "nexora-extract-zip-"));
const archive = join(root, "traversal.zip");
const destination = join(root, "destination");

try {
    await writeFile(archive, symlinkArchive("link", "../../escape.txt"));
    let rejected = false;
    try {
        await extract(archive, { dir: destination });
    } catch (error) {
        rejected = error instanceof Error && error.message.includes("Out of bound symlink target");
    }
    if (!rejected) throw new Error("extract-zip aceptó un symlink fuera del directorio de destino");
} finally {
    await rm(root, { force: true, recursive: true });
}

function symlinkArchive(name, target) {
    const nameBytes = Buffer.from(name);
    const targetBytes = Buffer.from(target);
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
    offset = write(central, offset, 4, (0o120777 << 16) >>> 0);
    offset = write(central, offset, 4, 0);
    nameBytes.copy(central, offset);

    const end = Buffer.alloc(22);
    offset = 0;
    offset = write(end, offset, 4, 0x06054b50);
    offset = write(end, offset, 2, 0);
    offset = write(end, offset, 2, 0);
    offset = write(end, offset, 2, 1);
    offset = write(end, offset, 2, 1);
    offset = write(end, offset, 4, central.length);
    offset = write(end, offset, 4, local.length);
    write(end, offset, 2, 0);
    return Buffer.concat([local, central, end]);
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

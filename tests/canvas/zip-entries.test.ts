// A zip of a wiki reads without a server (#239), and a hostile one reads as nothing.

import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import { readZipEntries } from "../../src/features/settings/import/zipEntries.ts";

const u16 = (value: number) => Buffer.from([value & 255, value >> 8]);
const u32 = (value: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; };

function zip(files: { name: string; body: string; store?: boolean }[]): Blob {
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const { name, body, store } of files) {
    const raw = Buffer.from(body);
    const data = store ? raw : deflateRawSync(raw);
    const nameBytes = Buffer.from(name);
    const method = store ? 0 : 8;
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(method), u32(0), u32(0), u32(data.length), u32(raw.length), u16(nameBytes.length), u16(0), nameBytes, data]);
    directory.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u32(0), u32(0), u32(data.length), u32(raw.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]));
    locals.push(local);
    offset += local.length;
  }
  const dir = Buffer.concat(directory);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(dir.length), u32(offset), u16(0)]);
  return new Blob([Buffer.concat([...locals, dir, end])]);
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

test("reads deflated and stored files with their folders", async () => {
  const entries = await readZipEntries(zip([
    { name: "wiki/", body: "", store: true },
    { name: "wiki/a.md", body: "# A\n".repeat(50) },
    { name: "wiki/deep/b.md", body: "# B", store: true },
  ]));
  assert.deepEqual(entries.map((entry) => entry.segments.join("/")), ["wiki/a.md", "wiki/deep/b.md"]);
  assert.equal(text(entries[0].bytes), "# A\n".repeat(50));
  assert.equal(text(entries[1].bytes), "# B");
});

test("drops a path climbing out of the archive", async () => {
  const entries = await readZipEntries(zip([{ name: "../evil.md", body: "x" }, { name: "ok.md", body: "y" }]));
  assert.deepEqual(entries.map((entry) => entry.segments.join("/")), ["ok.md"]);
});

test("a file that is not a zip reads as empty", async () => {
  assert.deepEqual(await readZipEntries(new Blob(["not a zip at all, but long enough to search through"])), []);
  assert.deepEqual(await readZipEntries(new Blob([])), []);
});

test("an entry inflating past the limit is dropped", async () => {
  const entries = await readZipEntries(zip([{ name: "bomb.md", body: "x".repeat(33 * 1024 * 1024) }]));
  assert.deepEqual(entries, []);
});

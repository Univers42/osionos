// The import panel promises ZIP files; they went to an /api/imports route no server
// mounts (#239). A zip of a wiki needs no server: the central directory plus the
// browser's DecompressionStream reads it, without a dependency.
//
// Caveat: stored and deflate entries only, and no zip64, so an archive over 4 GiB or
// with another compression method reads as empty rather than wrong. An encrypted entry
// is skipped. Sizes come from the archive, whose header can lie; MAX_ENTRY_BYTES is
// enforced on the inflated bytes so a bomb stops at the limit.

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const END_RECORD_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const STORED = 0;
const DEFLATE = 8;

export interface ZipEntry {
  /** Forward-slash path; never holds `.` or `..` segments. */
  segments: string[];
  bytes: Uint8Array;
}

function findEndRecord(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - END_RECORD_BYTES - MAX_COMMENT_BYTES);
  for (let at = view.byteLength - END_RECORD_BYTES; at >= lowest; at -= 1) {
    if (view.getUint32(at, true) === END_OF_DIRECTORY) return at;
  }
  return -1;
}

async function inflateBounded(compressed: Uint8Array): Promise<Uint8Array | null> {
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ENTRY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function safeSegments(path: string): string[] | null {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.some((segment) => segment === "." || segment === "..") ? null : segments;
}

function entryBytes(view: DataView, buffer: ArrayBuffer, localOffset: number, size: number): Uint8Array {
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  return new Uint8Array(buffer, localOffset + 30 + nameLength + extraLength, size);
}

/** Every file in the archive, in archive order; directories and bad entries are left out. */
export async function readZipEntries(archive: Blob): Promise<ZipEntry[]> {
  const buffer = await archive.arrayBuffer();
  if (buffer.byteLength < END_RECORD_BYTES) return [];
  const view = new DataView(buffer);
  const end = findEndRecord(view);
  if (end < 0) return [];
  const count = Math.min(view.getUint16(end + 10, true), MAX_ENTRIES);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = view.getUint32(end + 16, true);
  for (let index = 0; index < count && view.getUint32(at, true) === DIRECTORY_ENTRY; index += 1) {
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, at + 46, nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    const segments = safeSegments(name);
    const encrypted = (flags & 1) === 1;
    if (!segments || name.endsWith("/") || encrypted || (method !== STORED && method !== DEFLATE)) continue;
    const stored = entryBytes(view, buffer, localOffset, compressedSize);
    const bytes = method === DEFLATE ? await inflateBounded(stored) : stored;
    if (bytes && bytes.byteLength <= MAX_ENTRY_BYTES) entries.push({ segments, bytes });
  }
  return entries;
}

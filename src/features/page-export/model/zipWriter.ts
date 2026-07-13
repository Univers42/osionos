/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   zipWriter.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Dependency-free ZIP writer (method 0 = STORE, no compression) — the supply
// chain is locked (no new deps), and export archives are small enough that
// compression buys little. Produces standard archives every unzip tool reads.

import type { ExportFile } from "./exportTypes";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

class ByteSink {
  private chunks: Uint8Array[] = [];
  length = 0;
  push(chunk: Uint8Array) { this.chunks.push(chunk); this.length += chunk.length; }
  u16(value: number) { this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff])); }
  u32(value: number) {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]));
  }
  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }
}

/** Fixed DOS timestamp (2026-01-01 00:00) — deterministic archives. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** Build a STORE zip from files (paths use "/" separators, UTF-8 names). */
export function buildZip(files: ExportFile[]): Uint8Array {
  const sink = new ByteSink();
  const encoder = new TextEncoder();
  const central: Array<{ name: Uint8Array; crc: number; size: number; offset: number }> = [];

  for (const file of files) {
    const name = encoder.encode(file.path);
    const crc = crc32(file.bytes);
    central.push({ name, crc, size: file.bytes.length, offset: sink.length });
    sink.u32(0x04034b50);          // local file header
    sink.u16(20); sink.u16(0x800); // version 2.0, UTF-8 flag
    sink.u16(0);                   // method: store
    sink.u16(DOS_TIME); sink.u16(DOS_DATE);
    sink.u32(crc); sink.u32(file.bytes.length); sink.u32(file.bytes.length);
    sink.u16(name.length); sink.u16(0);
    sink.push(name); sink.push(file.bytes);
  }

  const centralStart = sink.length;
  for (const entry of central) {
    sink.u32(0x02014b50);                    // central directory header
    sink.u16(20); sink.u16(20); sink.u16(0x800); sink.u16(0);
    sink.u16(DOS_TIME); sink.u16(DOS_DATE);
    sink.u32(entry.crc); sink.u32(entry.size); sink.u32(entry.size);
    sink.u16(entry.name.length); sink.u16(0); sink.u16(0);
    sink.u16(0); sink.u16(0); sink.u32(0);
    sink.u32(entry.offset);
    sink.push(entry.name);
  }
  const centralSize = sink.length - centralStart;

  sink.u32(0x06054b50);                      // end of central directory
  sink.u16(0); sink.u16(0);
  sink.u16(central.length); sink.u16(central.length);
  sink.u32(centralSize); sink.u32(centralStart);
  sink.u16(0);
  return sink.concat();
}

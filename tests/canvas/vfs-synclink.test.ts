/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vfs-synclink.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import { buildVPath, joinV } from "../../src/features/ide/vfs/vpath.ts";
import { collectBytes, textToBytes, bytesToText } from "../../src/features/ide/vfs/bytes.ts";
import { createMemProvider } from "../../src/features/ide/vfs/memProvider.ts";
import { mirrorTree } from "../../src/features/ide/vfs/syncLink.ts";

const root = (scheme: string) => buildVPath(scheme, "t", []);

async function seedSource() {
  const src = createMemProvider("mem");
  const r = root("mem");
  await src.write(joinV(r, "main.c"), textToBytes("int main(){}"));
  await src.mkdir(joinV(r, "lib"));
  await src.write(joinV(r, "lib", "util.c"), textToBytes("// util"));
  await src.mkdir(joinV(r, "node_modules"));
  await src.write(joinV(r, "node_modules", "dep.js"), textToBytes("ignored"));
  await src.write(joinV(r, "big.bin"), new Uint8Array(2048));
  return src;
}

test("mirrorTree copies the tree, honors ignore + size caps, reports honestly", async () => {
  const src = await seedSource();
  const dst = createMemProvider("mem");
  const seen: string[] = [];
  const report = await mirrorTree(
    { provider: src, root: root("mem") },
    { provider: dst, root: root("mem") },
    { ignoreNames: new Set(["node_modules"]), maxFileBytes: 1024, beforeWrite: (relPath) => { seen.push(relPath); } },
  );
  assert.equal(report.written, 2);
  assert.equal(report.skipped, 1); // big.bin over the cap — counted, never truncated
  assert.deepEqual(report.failed, []);
  assert.deepEqual(seen.sort(), ["lib/util.c", "main.c"]);
  assert.equal(bytesToText(await collectBytes(await dst.read(joinV(root("mem"), "main.c")))), "int main(){}");
  assert.equal(bytesToText(await collectBytes(await dst.read(joinV(root("mem"), "lib", "util.c")))), "// util");
  await assert.rejects(dst.read(joinV(root("mem"), "node_modules", "dep.js")));
});

test("mirrorTree maxFiles cap counts the remainder as skipped", async () => {
  const src = await seedSource();
  const dst = createMemProvider("mem");
  const report = await mirrorTree(
    { provider: src, root: root("mem") },
    { provider: dst, root: root("mem") },
    { ignoreNames: new Set(["node_modules"]), maxFileBytes: 4096, maxFiles: 1 },
  );
  assert.equal(report.written, 1);
  assert.equal(report.skipped, 2);
  assert.deepEqual(report.failed, []);
});

test("mirrorTree collects per-entry failures instead of aborting the walk", async () => {
  const src = await seedSource();
  const dst = createMemProvider("mem");
  const failingDst = {
    ...dst,
    write: async (path: Parameters<typeof dst.write>[0], data: Parameters<typeof dst.write>[1]) => {
      if (path.segments.at(-1) === "main.c") throw Object.assign(new Error("boom"), { name: "Error" });
      return dst.write(path, data);
    },
  };
  const report = await mirrorTree(
    { provider: src, root: root("mem") },
    { provider: failingDst, root: root("mem") },
    { ignoreNames: new Set(["node_modules"]), maxFileBytes: 4096 },
  );
  assert.equal(report.written, 2); // lib/util.c + big.bin (cap raised here)
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0].relPath, "main.c");
  assert.equal(report.failed[0].code, "Io");
});

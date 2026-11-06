// osionos#286: an extension-less executable in an imported folder became a code page full of NULs,
// which the WAF refused (403) and PostgreSQL jsonb cannot store. It is now skipped as binary.

import assert from "node:assert/strict";
import test from "node:test";

import { looksBinary, readImportFiles } from "../../src/features/ide/model/importFolder.ts";

const file = (name: string, bytes: string | Uint8Array) => new File([bytes], name);

test("a NUL in the first 8,000 characters marks a file binary", () => {
  assert.equal(looksBinary("int main(void) { return 0; }\n"), false);
  assert.equal(looksBinary("\u007fELF\u0002\u0001\u0001\u0000\u0000"), true);
  assert.equal(looksBinary("x".repeat(9000) + "\u0000"), false);
});

test("an extension-less executable is skipped, its source kept", async () => {
  const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0]);
  const imported = await readImportFiles([file("push_swap", elf), file("main.c", "int main(void) { return 0; }\n"), file("Makefile", "NAME = push_swap\n")]);
  assert.deepEqual(imported.map((entry) => entry.relPath).sort(), ["Makefile", "main.c"]);
});

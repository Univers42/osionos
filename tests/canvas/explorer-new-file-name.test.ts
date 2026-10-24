import assert from "node:assert/strict";
import test from "node:test";

import { fileKindOf } from "../../src/features/ide/model/explorerRows.ts";
import { isCodeFileName } from "../../src/features/ide/model/ideLanguages.ts";
import { nameForNewFile } from "../../src/features/ide/model/newFileName.ts";

const table: Array<[string, string, "page" | "code"]> = [
  ["My notes", "My notes.omd", "page"],
  ["Meeting 10.18", "Meeting 10.18.omd", "page"],
  ["aaaaaaa", "aaaaaaa.omd", "page"],
  ["doc.omd", "doc.omd", "page"],
  ["DOC.OMD", "DOC.OMD", "page"],
  ["hello.c", "hello.c", "code"],
  ["Makefile", "Makefile", "code"],
  ["Dockerfile", "Dockerfile", "code"],
  ["notes.txt", "notes.txt", "code"],
  ["app.test.ts", "app.test.ts", "code"],
];

for (const [typed, created, kind] of table) {
  test(`new file "${typed}" is created as "${created}" and opens as ${kind}`, () => {
    const name = nameForNewFile(typed);
    assert.equal(name, created);
    assert.equal(fileKindOf(name), kind);
  });
}

test("isCodeFileName: plain-text extensions count, unknown ones do not", () => {
  assert.equal(isCodeFileName("a.log"), true);
  assert.equal(isCodeFileName("a.zzz"), false);
});

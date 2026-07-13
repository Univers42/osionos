import assert from "node:assert/strict";
import test from "node:test";

import { fileExtension, languageById, languageForFileName } from "../../src/features/ide/model/ideLanguages.ts";
import { codeBlockOf, createCodeFileBlock } from "../../src/features/ide/model/codeFile.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

test("fileExtension: dotfiles, paths, multi-dot, no extension", () => {
  assert.equal(fileExtension("main.py"), "py");
  assert.equal(fileExtension("a.b.c.tsx"), "tsx");
  assert.equal(fileExtension("src/app/run.sh"), "sh");
  assert.equal(fileExtension("Dockerfile"), "dockerfile"); // no dot → whole name, lowered
  assert.equal(fileExtension("README"), "readme");
  assert.equal(fileExtension("Main.PY"), "py"); // case-insensitive
});

test("languageForFileName: extension → language, else plaintext", () => {
  assert.equal(languageForFileName("main.py").id, "python");
  assert.equal(languageForFileName("app.cpp").id, "cpp");
  assert.equal(languageForFileName("a.h").id, "c"); // .h maps to C, not C++
  assert.equal(languageForFileName("run.sh").id, "shell");
  assert.equal(languageForFileName("index.tsx").id, "typescript");
  assert.equal(languageForFileName("Dockerfile").id, "dockerfile");
  assert.equal(languageForFileName("mystery.zzz").id, "plaintext"); // unknown → fallback
  assert.equal(languageForFileName("noext").id, "plaintext");
});

test("languageById: known id resolves, unknown falls back to plaintext", () => {
  assert.equal(languageById("go").id, "go");
  assert.equal(languageById("plaintext").id, "plaintext");
  assert.equal(languageById("does-not-exist").id, "plaintext");
  assert.equal(languageById(undefined).id, "plaintext");
});

test("createCodeFileBlock + codeBlockOf round-trip", () => {
  const block = createCodeFileBlock("main.py", "print('hi')");
  assert.equal(block.type, "code");
  assert.equal(block.language, "python");
  assert.equal(block.fileName, "main.py");
  assert.equal(block.content, "print('hi')");
  assert.equal(block.lineNumbers, true);
  assert.ok(block.id.length > 0);

  const page: PageEntry = { _id: "p1", title: "main.py", workspaceId: "w1", surface: "code", content: [block] };
  assert.equal(codeBlockOf(page)?.id, block.id);
  assert.equal(codeBlockOf({ _id: "p2", title: "empty", workspaceId: "w1" }), undefined);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { join, resolve } = require("node:path");
const vm = require("node:vm");
const esbuild = require("esbuild");

const MARKENGINE_ROOT = resolve(__dirname, "..");

function loadIndex() {
  const bundle = esbuild.buildSync({
    entryPoints: [join(MARKENGINE_ROOT, "index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["react"],
    write: false,
    tsconfig: join(MARKENGINE_ROOT, "tsconfig.json"),
  });

  const module = { exports: {} };
  const localRequire = (id) => {
    if (id === "react") {
      return {
        Fragment: Symbol.for("react.fragment"),
        createElement: (type, props, ...children) => ({
          type,
          props: props ?? {},
          children,
        }),
      };
    }
    return require(id);
  };

  vm.runInNewContext(bundle.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: localRequire,
    console,
    process,
    Buffer,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
  });
  return module.exports;
}

test("root index exposes the unified MarkEngine API", () => {
  const markengine = loadIndex();

  const canonicalBlocks = markengine.parse("# Title\n\n> [!note] Heads up");
  assert.equal(canonicalBlocks[0].type, "heading");
  assert.equal(markengine.isBlockNode(canonicalBlocks[0]), true);

  const canonicalHtml = markengine.renderHtml(canonicalBlocks);
  assert.match(canonicalHtml, /<h1/);
  assert.match(canonicalHtml, /Title/);

  const legacyResult = markengine.parseMarkdown("# Title", {
    documentVersion: 42,
  });
  assert.equal(legacyResult.ast.version, 42);

  assert.equal(typeof markengine.InlineDocument.fromSource("text").toSource(), "string");
  assert.equal(typeof markengine.MarkEngineWorker, "function");
});
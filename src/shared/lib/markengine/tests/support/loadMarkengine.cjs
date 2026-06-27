"use strict";

// Shared loader: bundles the TS engine entry with esbuild and evaluates it in a
// fresh VM context (react stubbed) so .cjs tests can exercise the public API.
const { join, resolve } = require("node:path");
const vm = require("node:vm");
const esbuild = require("esbuild");

const MARKENGINE_ROOT = resolve(__dirname, "..", "..");

function loadMarkengine() {
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
  const localRequire = (id) =>
    id === "react"
      ? {
          Fragment: Symbol.for("react.fragment"),
          createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
        }
      : require(id);

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

module.exports = { loadMarkengine };

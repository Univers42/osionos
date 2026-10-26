/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ts-extension-loader.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The repo lints src/ and packages/ only, so this file was never linted and its
// `no-undef` errors (URL) were invisible. The globals it uses are declared here,
// so the file is lint-clean on its own.
/* global URL */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Mirrors the Vite "@/*" -> "src/*" tsconfig path so tests can import modules
// that use the alias for value imports (type-only "@/" imports are erased).
const SRC_BASE = new URL("../../src/", import.meta.url);

// Third mirror of the markdown-engine alias. The other two are vite.config.ts
// (resolve.alias) and tsconfig.json (paths) — all three must agree. Tests don't
// go through Vite, so without this any APP file that imports
// "@osionos/markdown-engine" fails to resolve under node --test.
const ENGINE_SPECIFIER = "@osionos/markdown-engine";
const ENGINE_BASE = new URL("../../packages/markdown-engine/", import.meta.url);
const ENGINE_SUBPATHS = {
  "": "index.ts",
  "/blocks": "blocks.ts",
  "/inline": "inline.ts",
  "/inlineColorTokens": "inlineColorTokens.ts",
  "/dom": "dom.ts",
  "/react": "react.tsx",
  "/tables": "tableConfig.ts",
  "/terminal": "terminal.ts",
};

function resolveEngineSpecifier(specifier) {
  if (specifier !== ENGINE_SPECIFIER && !specifier.startsWith(`${ENGINE_SPECIFIER}/`)) {
    return null;
  }
  const subpath = specifier.slice(ENGINE_SPECIFIER.length);
  const mapped = ENGINE_SUBPATHS[subpath] ?? subpath.slice(1);
  return new URL(mapped, ENGINE_BASE).href;
}

const EXTRA_ALIASES = {
  "@osionos/outbox-ledger": new URL("../../packages/outbox-ledger/src/index.ts", import.meta.url).href,
  "@osionos/perf-probe": new URL("../../packages/perf-probe/src/index.ts", import.meta.url).href,
  "@osionos/feature-flags": new URL("../../packages/feature-flags/src/index.ts", import.meta.url).href,
  "@osionos/ui": new URL("../../packages/osionos-ui/src/index.ts", import.meta.url).href,
  "@osionos/http-gate": new URL("../../packages/http-gate/src/index.ts", import.meta.url).href,
  "@osionos/http-gate/react": new URL("../../packages/http-gate/src/react.ts", import.meta.url).href,
};

// Prefix aliases: "@osionos/ui/atoms/Button" -> packages/osionos-ui/src/atoms/Button.
// Mirrors the trailing-slash regex entries in vite.config.ts.
const PREFIX_ALIASES = [
  ["@osionos/ui/", new URL("../../packages/osionos-ui/src/", import.meta.url).href],
];

function resolvePrefixAlias(specifier) {
  for (const [prefix, base] of PREFIX_ALIASES) {
    if (specifier.startsWith(prefix)) return `${base}${specifier.slice(prefix.length)}`;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const engine =
    EXTRA_ALIASES[specifier] ?? resolvePrefixAlias(specifier) ?? resolveEngineSpecifier(specifier);
  const target = engine
    ? engine
    : specifier.startsWith("@/")
      ? new URL(specifier.slice(2), SRC_BASE).href
      : specifier;
  if ((target.startsWith(".") || target.startsWith("file:")) && !hasKnownExtension(target)) {
    // Mirror Vite/tsconfig resolution: a bare specifier is a .ts/.tsx file, else a
    // directory with an index.ts/.tsx (barrel imports like "@/features/block-editor").
    for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      try {
        return await nextResolve(`${target}${suffix}`, context);
      } catch (error) {
        if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
      }
    }
  }
  return nextResolve(target, context);
}

function hasKnownExtension(specifier) {
  // The query of a specifier is not part of the file name: `a.ts?env=…` is a
  // .ts file (see the AI client below).
  const path = specifier.split("?")[0];
  return [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"].some((extension) => path.endsWith(extension));
}

// The AI client reads `import.meta.env` (VITE_AI_URL) when it is asked whether the
// assistant is configured. Node has no env object, so this module is given one too —
// taken from the `env` query of the import specifier, which makes every environment a
// module of its own:
//   await import("../../src/features/ai/api/aiClient.ts?env=" + encodeURIComponent(JSON.stringify({ VITE_AI_URL: "…" })))
// Without the query the module gets an empty env, like a build that never set the
// variable.
const AI_CLIENT_MODULE = new URL("../../src/features/ai/api/aiClient.ts", import.meta.url).href;

/* -------------------------------------------------------------------------- */
/* The three differences between Vite and node                                  */
/* -------------------------------------------------------------------------- */
/*
 * Node runs the app's files; Vite runs them too, but it understands three
 * things node does not. Each of the three rules below closes one of them, and
 * together they are what lets a test render a component that holds JSX — the
 * read-only page's media block, for one.
 *
 * They touch the app's own files only: a library in node_modules is left
 * exactly as node read it.
 */

/** The root of this repo: the rules below are the app's, not the libraries'. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Is this file one of the app's? (A library in node_modules is not.) */
function isAppFile(path) {
  return path.startsWith(REPO_ROOT) && !path.includes("/node_modules/");
}

/**
 * A JSON import needs its attribute in node ("with { type: "json" }"); Vite
 * reads the file itself and never asks for one.
 */
const JSON_IMPORT = /(from\s+["'][^"']+\.json["'])(?!\s*(?:with|assert)\b)/g;

/** Adds the import attribute node asks for. */
function withJsonAttributes(source) {
  return source.replace(JSON_IMPORT, '$1 with { type: "json" }');
}

/**
 * Node has no `import.meta.env`: a module that reads it throws. The app reads
 * it for the API URL, the auth mode, the media keys — so a test that renders
 * a component of the app would load a module that cannot even be read. The
 * env object Vite's dev server would give it is given here instead: DEV on,
 * nothing set (the AI client above gets its own, from its query).
 */
const ENV_OBJECT = "import.meta.env ??= { DEV: true };\n";

/**
 * The env object, in the place where it may be read: after a shebang, which
 * has to stay the first line, and never in a file that has one already.
 */
function withEnv(source) {
  if (source.includes("import.meta.env ??")) return source;
  if (!source.startsWith("#!")) return ENV_OBJECT + source;
  const end = source.indexOf("\n");
  if (end === -1) return source;
  return source.slice(0, end + 1) + ENV_OBJECT + source.slice(end + 1);
}

/**
 * A .tsx file may hold JSX, and node's type stripping cannot parse it — the
 * TypeScript compiler is the one that can. It turns the file into plain
 * JavaScript, the react-jsx runtime included.
 *
 * The compiler is loaded LAZILY: a suite that reads no .tsx file never pays
 * for it, and the files that hold no JSX (the markdown engine's renderers)
 * come out of the compiler exactly as they went in.
 */
let typescript = null;

async function compiler() {
  if (!typescript) typescript = (await import("typescript")).default;
  return typescript;
}

/** The JavaScript of a .tsx file, JSX and types gone. */
async function compileTsx(path, source) {
  const ts = await compiler();
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      // Node's own type stripping keeps every import it cannot prove is a
      // type: the compiler must not elide one the runtime still needs.
      verbatimModuleSyntax: true,
    },
  });
  return outputText;
}

export async function load(url, context, nextLoad) {
  const [path] = url.split("?");
  // A module that is not a file of the disk (a data: URL, a node: builtin)
  // is none of the app's business.
  const isFile = path.startsWith("file:");

  // A style import is Vite's business; in node it is an empty module, so a
  // component that imports its .scss can still be rendered to markup. A CSS
  // module's import is read for its class names: each name maps to itself.
  if (isFile && /\.module\.s?css$/.test(path)) {
    return { format: "module", source: "export default new Proxy({}, { get: (_, name) => String(name) });", shortCircuit: true };
  }
  if (isFile && /\.s?css$/.test(path)) return { format: "module", source: "", shortCircuit: true };

  // A .tsx file: node refuses the extension outright, so the source is
  // compiled here — the markdown engine's React renderer is one (it calls
  // React.createElement, so it holds no JSX) and a component of the app is
  // another (it holds JSX, and node's type stripping cannot read that).
  if (isFile && path.endsWith(".tsx")) {
    const file = fileURLToPath(path);
    const compiled = withJsonAttributes(await compileTsx(file, await readFile(file, "utf8")));
    return { format: "module", source: isAppFile(file) ? withEnv(compiled) : compiled, shortCircuit: true };
  }

  const loaded = await nextLoad(url, context);
  if (loaded.source == null) return loaded;
  if (path === AI_CLIENT_MODULE) {
    const env = new URL(url).searchParams.get("env") ?? "{}";
    return { ...loaded, source: `import.meta.env ??= ${env};\n${loaded.source}` };
  }

  // The app's own files: the JSON attribute node asks for, and the env object
  // Vite would have given them. A library is left as node read it.
  if (!isFile || !isAppFile(fileURLToPath(path))) return loaded;
  if (loaded.format !== "module" && loaded.format !== "module-typescript") return loaded;
  return { ...loaded, source: withEnv(withJsonAttributes(String(loaded.source))) };
}

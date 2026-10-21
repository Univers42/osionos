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

// Node has no `import.meta.env`, so appUrls.ts would resolve every embedded-app URL to ""
// (its production answer) and suites that exercise a configured app would see it hidden.
// Give that one module the env object Vite's dev server would: DEV on, nothing set.
const APP_URLS_MODULE = new URL("../../src/shared/config/appUrls.ts", import.meta.url).href;

// The AI client reads `import.meta.env` (VITE_AI_URL) when it is asked whether the
// assistant is configured. Node has no env object, so this module is given one too —
// taken from the `env` query of the import specifier, which makes every environment a
// module of its own:
//   await import("../../src/features/ai/api/aiClient.ts?env=" + encodeURIComponent(JSON.stringify({ VITE_AI_URL: "…" })))
// Without the query the module gets an empty env, like a build that never set the
// variable.
const AI_CLIENT_MODULE = new URL("../../src/features/ai/api/aiClient.ts", import.meta.url).href;

export async function load(url, context, nextLoad) {
  const [path] = url.split("?");

  // A .tsx file: the markdown engine's React renderer is one (it calls
  // React.createElement, so it holds NO JSX syntax) and node refuses the
  // extension outright. Node's own type stripping reads it as TypeScript.
  if (path.endsWith(".tsx")) {
    const source = await readFile(fileURLToPath(path), "utf8");
    return { format: "module-typescript", source, shortCircuit: true };
  }

  const loaded = await nextLoad(url, context);
  if (loaded.source == null) return loaded;
  if (url === APP_URLS_MODULE) {
    return { ...loaded, source: `import.meta.env ??= { DEV: true };\n${loaded.source}` };
  }
  if (path === AI_CLIENT_MODULE) {
    const env = new URL(url).searchParams.get("env") ?? "{}";
    return { ...loaded, source: `import.meta.env ??= ${env};\n${loaded.source}` };
  }
  return loaded;
}

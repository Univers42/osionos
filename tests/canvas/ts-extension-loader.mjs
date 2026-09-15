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

export async function resolve(specifier, context, nextResolve) {
  const engine = resolveEngineSpecifier(specifier);
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
  return [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"].some((extension) => specifier.endsWith(extension));
}

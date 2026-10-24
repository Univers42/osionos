// Reading the generated and hand-written stylesheets from the token tests.

import { readFileSync } from "node:fs";

export const APP_ROOT = new URL("../../", import.meta.url);
export const readAppFile = (path: string) => readFileSync(new URL(path, APP_ROOT), "utf8");

/** The declarations of every `selector { … }` block in `css` whose selector matches `selectorPattern`, by selector. */
export function blocksOf(css: string, selectorPattern: RegExp) {
  const found = new Map<string, Record<string, string>>();
  for (const [, selector, body] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const key = selector.trim().replaceAll(/\s+/g, " ");
    if (!selectorPattern.test(key)) continue;
    found.set(key, { ...found.get(key), ...Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])) });
  }
  return found;
}


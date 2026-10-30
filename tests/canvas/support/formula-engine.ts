/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   formula-engine.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Boots the REAL Rust formula engine under node. Its WASM is fetched from a file:// URL,
// which node's fetch refuses, so that one scheme is served from disk for the boot only.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { initFormulaEngine, isWasmReady } from "../../../src/shared/notion-database-sys/src/lib/engine/bridge.ts";

export async function bootFormulaEngine(): Promise<void> {
  const originalFetch = globalThis.fetch;
  // The bridge reads the flag the Vite define injects in the browser; in node the
  // identifier is free, so it has to exist before the engine is asked for.
  (globalThis as Record<string, unknown>).__OBJECT_DATABASE_DISABLE_WASM__ = false;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (!url.startsWith("file:")) return originalFetch(input as never);
    return new Response(await readFile(fileURLToPath(url)), { headers: { "content-type": "application/wasm" } });
  }) as typeof fetch;
  try {
    assert.equal(await initFormulaEngine(), true, "the formula engine must boot");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(isWasmReady(), true);
}

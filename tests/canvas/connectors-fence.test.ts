/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectors-fence.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";

/**
 * Inference fence (§2/§8.8), SCOPED to the new subsystem per the Phase-0 gate:
 * connector (and, when added, chat-shell) code must not import the existing
 * inference path or any provider completion/streaming API. The bridge broker's
 * non-completion validate (scripts/bridge-connector.mjs → GET /v1/models) is out
 * of scope here — it is the server-side credential probe, not client inference.
 */
const FENCED_DIRS = ["../../src/features/connectors/", "../../src/features/chat/", "../../src/widgets/chat-shell/"];
const FORBIDDEN: Array<{ re: RegExp; why: string }> = [
  { re: /useAgentStream/, why: "reuse inference only behind the Phase-2 adapter" },
  { re: /\/api\/agent\b/, why: "the agent completion endpoint is Phase-2" },
  { re: /api\.anthropic\.com/, why: "no direct provider API in the client subsystem" },
  { re: /@anthropic-ai/, why: "no provider SDK in the client subsystem" },
];

async function tsFiles(dirUrl: URL): Promise<string[]> {
  const entries = await readdir(dirUrl, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => `${e.parentPath}/${e.name}`);
}

test("inference fence: connector subsystem imports no completion/streaming API", async () => {
  for (const rel of FENCED_DIRS) {
    const files = await tsFiles(new URL(rel, import.meta.url));
    assert.ok(files.length > 0, `expected files under ${rel}`);
    for (const path of files) {
      const src = await readFile(path, "utf8");
      for (const { re, why } of FORBIDDEN) {
        assert.ok(!re.test(src), `${path} must not match ${re} — ${why}`);
      }
    }
  }
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-opt-in.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The assistant is OPT-IN: `VITE_AI_URL` is the only switch.
 *
 * `VITE_API_URL` and `VITE_OSIONOS_BRIDGE_URL` are set in EVERY build — they
 * are the bridge, which always runs. A fallback to them made
 * `isAiConfigured()` true everywhere: every build showed the AI actions of
 * the slash menu and swapped the chat port to the AI service even where no
 * such service runs, and every AI action failed.
 *
 * Node has no `import.meta.env`, so the test loader gives the AI client one,
 * taken from the `env` query of the import specifier: every environment is a
 * module of its own.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { aiSlashCommands } from "@/features/slash-commands/model/aiSlashCommands";

/** The AI client of a build with this environment. */
function aiClient(env: Record<string, string>): Promise<typeof import("../../src/features/ai/api/aiClient")> {
  const query = encodeURIComponent(JSON.stringify(env));
  return import(`../../src/features/ai/api/aiClient.ts?env=${query}`);
}

test("the bridge's URL alone does not configure the assistant", async () => {
  const { isAiConfigured } = await aiClient({ VITE_API_URL: "https://localhost:4000" });
  assert.equal(isAiConfigured(), false, "the bridge is not the AI service");
});

test("the slash catalog has no AI item when the assistant is not configured", async () => {
  const { isAiConfigured } = await aiClient({ VITE_API_URL: "https://localhost:4000" });
  assert.deepEqual(aiSlashCommands(isAiConfigured()), [], "no service, no AI action");
});

test("VITE_AI_URL configures the assistant, and the catalog gets its group", async () => {
  const { isAiConfigured, aiBaseUrl } = await aiClient({ VITE_AI_URL: "https://localhost:4000" });
  assert.equal(isAiConfigured(), true);
  assert.equal(aiBaseUrl(), "https://localhost:4000/api/ai");
  assert.equal(aiSlashCommands(isAiConfigured()).length, 12, "one entry per editor command, and the dictation");
});

test("an empty VITE_AI_URL is no configuration", async () => {
  const { isAiConfigured } = await aiClient({ VITE_AI_URL: "", VITE_API_URL: "https://localhost:4000" });
  assert.equal(isAiConfigured(), false);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-connections.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The connections: what the user picked, what the forms say, what the way
 * back from OpenRouter does — and the one rule that matters most: a key goes
 * to the service and stays there.
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_SELECTION_STORAGE_KEY,
  PLATFORM_CONNECTION_ID,
  readAiSelection,
  resolveAiSelection,
  writeAiSelection,
} from "@/features/ai/model/aiSelection";
import { LOCALHOST_MESSAGE, validateEndpointUrl } from "@/features/ai/model/aiConnectionForm";
import { completeOAuthReturn, readOAuthReturn, stripOAuthParams } from "@/features/ai/model/aiOAuthReturn";

/** A storage that keeps what it is given, and can show it. */
function fakeStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
    key: () => null,
    length: 0,
    /** Everything that was written, as one string. */
    dump: () => Array.from(entries.values()).join("\n"),
    get size() {
      return entries.size;
    },
  };
}

/** The connections the service would answer with. */
const CONNECTIONS = [{ id: PLATFORM_CONNECTION_ID }, { id: "conn-1" }];

/** The models of each connection. */
const MODELS: Record<string, Array<{ id: string; default?: boolean }>> = {
  [PLATFORM_CONNECTION_ID]: [
    { id: "platform-default", default: true },
    { id: "platform-other" },
  ],
  "conn-1": [
    { id: "conn-1-default", default: true },
    { id: "conn-1-other" },
  ],
};

/* -------------------------------------------------------------------------- */
/* The selection                                                              */
/* -------------------------------------------------------------------------- */

test("a stored connection that is gone falls back to the platform and its default", () => {
  const resolved = resolveAiSelection(
    { connectionId: "gone-with-the-server", model: "some-model" },
    CONNECTIONS,
    MODELS,
  );
  assert.equal(resolved.connectionId, PLATFORM_CONNECTION_ID);
  assert.equal(resolved.model, "platform-default");
});

test("a stored model the connection does not offer falls back to that connection's default", () => {
  const resolved = resolveAiSelection(
    { connectionId: "conn-1", model: "a-model-that-is-gone" },
    CONNECTIONS,
    MODELS,
  );
  assert.equal(resolved.connectionId, "conn-1");
  assert.equal(resolved.model, "conn-1-default");
});

test("a choice that still exists is kept as it is", () => {
  const resolved = resolveAiSelection({ connectionId: "conn-1", model: "conn-1-other" }, CONNECTIONS, MODELS);
  assert.deepEqual(resolved, { connectionId: "conn-1", model: "conn-1-other" });
});

test("nothing stored means the platform connection and its default", () => {
  const resolved = resolveAiSelection(null, CONNECTIONS, MODELS);
  assert.deepEqual(resolved, { connectionId: PLATFORM_CONNECTION_ID, model: "platform-default" });
});

test("the choice is remembered under one key, and read back", () => {
  const storage = fakeStorage();
  writeAiSelection({ connectionId: "conn-1", model: "conn-1-other" }, storage);
  assert.equal(storage.size, 1);
  assert.deepEqual(readAiSelection(storage), { connectionId: "conn-1", model: "conn-1-other" });
  assert.equal(AI_SELECTION_STORAGE_KEY, "osionos.ai.selection.v1");
});

test("a broken stored choice is read as no choice at all", () => {
  const storage = fakeStorage();
  storage.setItem(AI_SELECTION_STORAGE_KEY, "{not json");
  assert.equal(readAiSelection(storage), null);
});

/* -------------------------------------------------------------------------- */
/* The endpoint form                                                          */
/* -------------------------------------------------------------------------- */

test("an empty base URL is refused", () => {
  const check = validateEndpointUrl("   ");
  assert.equal(check.ok, false);
  assert.match(check.message, /Enter the base URL/);
});

test("a localhost address shows the tunnel hint", () => {
  const check = validateEndpointUrl("http://localhost:11434/v1");
  assert.equal(check.ok, false);
  assert.equal(check.message, LOCALHOST_MESSAGE);
  assert.match(check.message, /localhost/);
  assert.match(check.message, /Tailscale Funnel/);
});

test("a public https endpoint is accepted", () => {
  const check = validateEndpointUrl("https://x.example/v1");
  assert.equal(check.ok, true);
  assert.equal(check.message, "");
});

test("something that is not a URL is refused", () => {
  const check = validateEndpointUrl("x.example/v1");
  assert.equal(check.ok, false);
  assert.match(check.message, /not a URL/);
});

/* -------------------------------------------------------------------------- */
/* The way back from OpenRouter                                               */
/* -------------------------------------------------------------------------- */

test("the OAuth parameters are read off the URL", () => {
  assert.deepEqual(readOAuthReturn("https://app.example/settings?code=abc&state=xyz"), {
    code: "abc",
    state: "xyz",
  });
  assert.equal(readOAuthReturn("https://app.example/settings"), null);
  assert.equal(readOAuthReturn("https://app.example/settings?code=abc"), null);
});

test("the OAuth parameters are taken off the URL, the rest stays", () => {
  assert.equal(stripOAuthParams("https://app.example/settings?code=abc&state=xyz"), "/settings");
  assert.equal(stripOAuthParams("https://app.example/settings?tab=ai&code=abc&state=xyz"), "/settings?tab=ai");
});

test("an OAuth return is finished once, and the parameters are stripped", async () => {
  const calls: Array<[string, string]> = [];
  const replaced: string[] = [];
  const finished = await completeOAuthReturn({
    href: "https://app.example/settings?code=abc&state=xyz",
    complete: async (code, state) => {
      calls.push([code, state]);
      return { id: "conn-1" };
    },
    replace: (url) => replaced.push(url),
  });
  assert.equal(finished, true);
  assert.deepEqual(calls, [["abc", "xyz"]], "the code is exchanged exactly once");
  assert.deepEqual(replaced, ["/settings"], "the parameters are taken off the URL");
});

test("the parameters are gone even when the exchange fails", async () => {
  const replaced: string[] = [];
  await assert.rejects(
    completeOAuthReturn({
      href: "https://app.example/settings?code=abc&state=xyz",
      complete: async () => {
        throw new Error("the service said no");
      },
      replace: (url) => replaced.push(url),
    }),
  );
  assert.deepEqual(replaced, ["/settings"], "a remount must not try the same code again");
});

test("a page without the parameters is left alone", async () => {
  let calls = 0;
  const replaced: string[] = [];
  const finished = await completeOAuthReturn({
    href: "https://app.example/settings",
    complete: async () => {
      calls += 1;
      return {};
    },
    replace: (url) => replaced.push(url),
  });
  assert.equal(finished, false);
  assert.equal(calls, 0, "nothing is exchanged");
  assert.deepEqual(replaced, [], "the URL is not touched");
});

/* -------------------------------------------------------------------------- */
/* The key stays on the server                                                */
/* -------------------------------------------------------------------------- */

test("an API key goes to the service and nowhere else", async () => {
  const storage = fakeStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage as unknown as Storage;

  const logged: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));

  const urls: string[] = [];
  const bodies: string[] = [];
  const { createConnection, setAiTransport } = await import("@/features/ai/api/aiClient");
  setAiTransport(async (input, init) => {
    urls.push(String(input));
    bodies.push(String(init?.body ?? ""));
    return new Response(
      JSON.stringify({
        id: "conn-1",
        kind: "api_key",
        provider: "openai",
        label: "My key",
        status: "ok",
        createdAt: "2026-10-21T00:00:00.000Z",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  });

  try {
    await createConnection({ kind: "api_key", provider: "openai", apiKey: "sk-secret-value" });
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }

  assert.equal(urls.length, 1);
  assert.match(bodies[0], /sk-secret-value/, "the key travels in the body of the request");
  assert.doesNotMatch(urls[0], /sk-secret-value/, "the key never rides in the URL");
  assert.equal(logged.join("\n").includes("sk-secret-value"), false, "the key is never logged");
  assert.equal(storage.size, 0, "the client writes nothing down");
  assert.equal(storage.dump().includes("sk-secret-value"), false, "the key is nowhere in the storage");
});

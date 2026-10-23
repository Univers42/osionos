/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-device-port.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEVICE_CONNECTION_ID,
  DEVICE_ENGINE_STORAGE_KEY,
  clearDeviceEngine,
  readDeviceEngine,
  validateDeviceUrl,
  writeDeviceEngine,
} from "@/features/ai/model/deviceEngine";
import { fetchDeviceSources } from "@/features/ai/api/deviceSources";
import { deviceInferencePort } from "@/features/ai/model/deviceInferencePort";
import { PLATFORM_CONNECTION_ID } from "@/features/ai/model/aiSelection";

const TOKEN = "osionos_v1.token-A";
const BASE = "https://ai.test";

function fakeStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
    key: () => null,
    length: 0,
    dump: () => Array.from(entries.values()).join("\n"),
    get size() {
      return entries.size;
    },
  };
}

function installStore() {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["__playgroundUserStore"] = {
    getState: () => ({
      activePageJwt: () => TOKEN,
      activeJwt: () => TOKEN,
      handleSessionRevoked: () => undefined,
    }),
  };
}

function sseResponse(chunks: string[], terminal = "done"): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
      }
      if (terminal) controller.enqueue(encoder.encode(`event: ${terminal}\ndata: {}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/* -------------------------------------------------------------------------- */
/* validateDeviceUrl                                                           */
/* -------------------------------------------------------------------------- */

test("validateDeviceUrl accepts localhost, 127.0.0.1 and [::1]", () => {
  assert.deepEqual(validateDeviceUrl("http://localhost:11434"), { ok: true, baseUrl: "http://localhost:11434" });
  assert.deepEqual(validateDeviceUrl("http://127.0.0.1:8080/v1/"), { ok: true, baseUrl: "http://127.0.0.1:8080" });
  assert.deepEqual(validateDeviceUrl("http://[::1]:1234"), { ok: true, baseUrl: "http://[::1]:1234" });
});

test("validateDeviceUrl refuses non-local hosts and bad shapes", () => {
  for (const raw of [
    "http://192.168.1.5:11434",
    "https://example.com",
    "http://0.0.0.0:11434",
    "http://user:pw@localhost:1",
    "http://localhost:1/?x=1",
  ]) {
    const result = validateDeviceUrl(raw);
    assert.equal(result.ok, false, raw);
  }
});

/* -------------------------------------------------------------------------- */
/* a stream                                                                    */
/* -------------------------------------------------------------------------- */

test("a stream with 2 sources and 3 engine chunks emits the right frames", async () => {
  const storage = fakeStorage();
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["localStorage"] = storage;
  clearDeviceEngine(storage);
  writeDeviceEngine({ baseUrl: "http://localhost:11434", model: "m", apiKey: "secret-key" }, storage);

  const calls: Array<{ url: string; body: unknown; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/sources")) {
      calls.push({ url: u, body: init?.body, init });
      return new Response(
        JSON.stringify({
          sources: [
            { pageId: "p1", blockId: "b1", title: "T1", headingPath: "H1", snippet: "S1", score: 1 },
            { pageId: "p2", blockId: "b2", title: "T2", headingPath: "H2", snippet: "S2", score: 2 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    calls.push({ url: u, body: init?.body, init });
    return sseResponse(["a", "b", "c"]);
  }) as typeof fetch;

  const events: Array<[string, Record<string, unknown>]> = [];
  await deviceInferencePort.stream(
    { conversationId: "c", text: "question", connectionId: DEVICE_CONNECTION_ID },
    (event, data) => events.push([event, data as Record<string, unknown>]),
  );

  // frame order
  assert.equal(events[0][0], "run.started");
  assert.equal(events[0][1].retrievedCount, 2);
  assert.equal(events[1][0], "citation");
  assert.equal(events[2][0], "citation");
  assert.equal(events[3][0], "text.delta");
  assert.equal(events[4][0], "text.delta");
  assert.equal(events[5][0], "text.delta");
  assert.equal(events[6][0], "done");

  // engine request
  const engineCall = calls.find((call) => call.url === "http://localhost:11434/v1/chat/completions");
  assert.ok(engineCall, "engine called");
  const engineInit = engineCall!.init as RequestInit & { targetAddressSpace?: string };
  assert.equal(engineInit.targetAddressSpace, "loopback");
  const engineHeaders = engineInit.headers as Record<string, string>;
  assert.equal(engineHeaders["Authorization"], "Bearer secret-key");

  // sources request body
  const sourcesCall = calls.find((call) => call.url.endsWith("/sources"))!;
  const sourcesBody = JSON.parse(String(sourcesCall.body));
  assert.deepEqual(sourcesBody, { query: "question", limit: 8 });

  // no key or engine url in sources request
  const sourcesRaw = String(sourcesCall.body);
  assert.equal(sourcesRaw.includes("secret-key"), false);
  assert.equal(sourcesRaw.includes("localhost:11434"), false);

  // messages shape
  const engineBody = JSON.parse(String(engineCall!.body));
  const messages = engineBody.messages as Array<{ role: string; content: string }>;
  assert.equal(messages.length, 3);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.equal(messages[2].role, "user");
  assert.equal(messages[2].content, "question");
  assert.match(messages[1].content, /\[1\]/);
  assert.match(messages[1].content, /S1/);
});

test("sources answer 429 -> sources_failed and no engine request", async () => {
  const storage = fakeStorage();
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["localStorage"] = storage;
  clearDeviceEngine(storage);
  writeDeviceEngine({ baseUrl: "http://localhost:11434", model: "m" }, storage);

  const calls: string[] = [];
  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("/sources")) {
      return new Response(JSON.stringify({ code: "rate_limited" }), { status: 429, headers: { "content-type": "application/json" } });
    }
    return sseResponse(["x"]);
  }) as typeof fetch;

  const events: string[] = [];
  const data: unknown[] = [];
  await deviceInferencePort.stream(
    { conversationId: "c", text: "question", connectionId: DEVICE_CONNECTION_ID },
    (event, d) => {
      events.push(event);
      data.push(d);
    },
  );

  assert.deepEqual(events, ["error"]);
  assert.equal((data[0] as { code?: string }).code, "sources_failed");
  assert.equal(calls.some((u) => u.includes("/v1/chat/completions")), false);
});

test("engine fetch throws TypeError -> device_unreachable", async () => {
  const storage = fakeStorage();
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["localStorage"] = storage;
  clearDeviceEngine(storage);
  writeDeviceEngine({ baseUrl: "http://localhost:11434", model: "m" }, storage);

  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    if (u.endsWith("/sources")) {
      return new Response(JSON.stringify({ sources: [{ pageId: "p", blockId: "b", title: "t", headingPath: "h", snippet: "s", score: 1 }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new TypeError("failed");
  }) as typeof fetch;

  const events: string[] = [];
  const data: unknown[] = [];
  await deviceInferencePort.stream(
    { conversationId: "c", text: "question", connectionId: DEVICE_CONNECTION_ID },
    (event, d) => {
      events.push(event);
      data.push(d);
    },
  );

  assert.equal(events.includes("error"), true);
  const err = data.find((_, i) => events[i] === "error") as { code?: string };
  assert.equal(err.code, "device_unreachable");
});

/* -------------------------------------------------------------------------- */
/* routing                                                                     */
/* -------------------------------------------------------------------------- */

test("routing: device with stored engine -> device port", async () => {
  installStore();
  const storage = fakeStorage();
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["localStorage"] = storage;
  clearDeviceEngine(storage);
  writeDeviceEngine({ baseUrl: "http://localhost:11434", model: "m" }, storage);

  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    if (u.endsWith("/sources")) {
      return new Response(JSON.stringify({ sources: [{ pageId: "p", blockId: "b", title: "t", headingPath: "h", snippet: "s", score: 1 }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("/v1/chat/completions")) return sseResponse(["hi"]);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const { selectInferencePort } = await import(`../../src/features/ai/model/aiInferencePort.ts?env=${encodeURIComponent(JSON.stringify({ VITE_AI_URL: BASE }))}`);
  const port = selectInferencePort();
  const events: string[] = [];
  await port.stream!(
    { conversationId: "c", text: "q", connectionId: DEVICE_CONNECTION_ID, workspaceId: "w" },
    (e) => events.push(e),
  );
  assert.equal(events.includes("text.delta"), true);
});

test("routing: platform -> service port", async () => {
  installStore();
  const storage = fakeStorage();
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["localStorage"] = storage;
  clearDeviceEngine(storage);

  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    if (u.includes("/conversations")) {
      return new Response(JSON.stringify({ id: "srv-conv" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("/runs")) {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(enc.encode("event: done\ndata: {}\n\n"));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const { selectInferencePort } = await import(`../../src/features/ai/model/aiInferencePort.ts?env=${encodeURIComponent(JSON.stringify({ VITE_AI_URL: BASE }))}`);
  const port = selectInferencePort();
  const events: string[] = [];
  await port.stream!(
    { conversationId: "c", text: "q", connectionId: PLATFORM_CONNECTION_ID, workspaceId: "w" },
    (e) => events.push(e),
  );
  assert.equal(events.includes("done"), true);
});

test("routing: device with no stored engine -> service port", async () => {
  installStore();
  const storage = fakeStorage();
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["localStorage"] = storage;
  clearDeviceEngine(storage);

  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    if (u.includes("/conversations")) {
      return new Response(JSON.stringify({ id: "srv-conv" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("/runs")) {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(enc.encode("event: done\ndata: {}\n\n"));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const { selectInferencePort } = await import(`../../src/features/ai/model/aiInferencePort.ts?env=${encodeURIComponent(JSON.stringify({ VITE_AI_URL: BASE }))}`);
  const port = selectInferencePort();
  const events: string[] = [];
  await port.stream!(
    { conversationId: "c", text: "q", connectionId: DEVICE_CONNECTION_ID, workspaceId: "w" },
    (e) => events.push(e),
  );
  assert.equal(events.includes("done"), true);
});

// keep imports used
void readDeviceEngine;
void fetchDeviceSources;
void PLATFORM_CONNECTION_ID;
void DEVICE_ENGINE_STORAGE_KEY;

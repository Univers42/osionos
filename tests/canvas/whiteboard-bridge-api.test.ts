import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createBridgeBoardApi } from "../../src/features/whiteboard/model/bridgeBoardApi.ts";

class Refusal extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fetch that records each request and answers from `reply`. */
function fakeFetch(reply: (sent: Sent) => Response) {
  const sent: Sent[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const request: Sent = {
      url: String(input),
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: init.body,
    };
    sent.push(request);
    return reply(request);
  };
  return { sent, fetchImpl: fetchImpl as typeof fetch };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const api = (fetchImpl: typeof fetch, token: string | null = "wb-token") =>
  createBridgeBoardApi({
    baseUrl: "https://bridge.example/",
    token: async () => token,
    fetchImpl,
    refusal: (status, code, message) => new Refusal(status, code, message),
  });

test("reads a board with its tombstones, under the whiteboard token only", async () => {
  const { sent, fetchImpl } = fakeFetch(() => json(200, { slug: "abcdefgh1234", rev: 3 }));
  const board = await api(fetchImpl).getBoard("abcdefgh1234", { tombstones: true });
  assert.equal(board.rev, 3);
  assert.equal(sent[0]?.url, "https://bridge.example/api/whiteboard/v1/boards/abcdefgh1234?include=tombstones");
  assert.equal(sent[0]?.headers.authorization, "Bearer wb-token");
});

test("a refusal carries the route's status and code, so a 404 opens a new board", async () => {
  const { fetchImpl } = fakeFetch(() => json(404, { error: { code: "not_found", message: "No such board." } }));
  await assert.rejects(api(fetchImpl).getBoard("abcdefgh1234"), (error: Refusal) => {
    assert.equal(error.status, 404);
    assert.equal(error.code, "not_found");
    return true;
  });
});

test("writes a scene against the rev it read, and creates a board under the slug it was given", async () => {
  const { sent, fetchImpl } = fakeFetch((request) => (request.method === "POST" ? json(201, { slug: "abcdefgh1234", rev: 0 }) : json(200, { rev: 5 })));
  const client = api(fetchImpl);
  await client.createBoard("Plan", "abcdefgh1234");
  await client.replaceBoard("abcdefgh1234", { type: "osidraw", version: 1, elements: [] }, 4);
  assert.deepEqual(JSON.parse(String(sent[0]?.body)), { title: "Plan", slug: "abcdefgh1234" });
  assert.equal(sent[1]?.method, "PUT");
  assert.equal(sent[1]?.headers["if-match"], '"4"');
  assert.deepEqual(JSON.parse(String(sent[1]?.body)), { type: "osidraw", version: 1, elements: [] });
});

test("sends a thumbnail as a PNG", async () => {
  const { sent, fetchImpl } = fakeFetch(() => new Response(null, { status: 204 }));
  await api(fetchImpl).putThumbnail("abcdefgh1234", new Blob([new Uint8Array([0x89])], { type: "image/png" }));
  assert.equal(sent[0]?.url, "https://bridge.example/api/whiteboard/v1/boards/abcdefgh1234/thumbnail");
  assert.equal(sent[0]?.headers["content-type"], "image/png");
});

test("without a session there is no token, and nothing is sent", async () => {
  const { sent, fetchImpl } = fakeFetch(() => json(200, {}));
  await assert.rejects(api(fetchImpl, null).getBoard("abcdefgh1234"), (error: Refusal) => error.status === 401);
  assert.equal(sent.length, 0);
});

test("the library is handed four board calls and no other handle", () => {
  const { fetchImpl } = fakeFetch(() => json(200, {}));
  assert.deepEqual(Object.keys(api(fetchImpl)).sort(), ["createBoard", "getBoard", "putThumbnail", "replaceBoard"]);
});

test("a request carries the whiteboard bearer and no ambient credential", async () => {
  const seen: RequestInit[] = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init: RequestInit = {}) => {
    seen.push(init);
    return json(200, { slug: "abcdefgh1234", rev: 1 });
  }) as typeof fetch;
  await api(fetchImpl).getBoard("abcdefgh1234");
  assert.equal(seen[0]?.credentials, undefined);
  assert.deepEqual([...new Headers(seen[0]?.headers).keys()], ["authorization"]);
});

// Caveat: a text match on import lines. It misses a session getter reached through a re-export
// or a dynamic import; it over-reports nothing. Ruling condition 1 of osionos#319.
test("the in-process board's modules import no app-session getter", () => {
  const model = new URL("../../src/features/whiteboard/model/", import.meta.url);
  const importsOf = (file: string) => readFileSync(new URL(file, model), "utf8").split("\n").filter((line) => line.startsWith("import "));
  assert.deepEqual(importsOf("bridgeBoardApi.ts"), ['import type { HostedBoardApi, HydrawnBoard, HydrawnBoardSummary } from "@hydrawn/board";']);
  const clientImports = importsOf("inProcessBoard.ts").filter((line) => line.includes("@/shared/api/"));
  assert.deepEqual(clientImports, ['import { API_BASE } from "@/shared/api/client";']);
});

import assert from "node:assert/strict";
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

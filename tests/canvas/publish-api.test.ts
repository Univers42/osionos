/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publish-api.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The three public writes that answer L0: publishing a page, publishing a
 * marketplace app, creating a community.
 *
 * Two things are checked, and they are the two halves of the question L0 asks:
 *   1. the body carries the author's answer ONLY when the author gave one —
 *      a client that always sends `acknowledgeWarning: true` publishes
 *      everything, warning or not;
 *   2. the answer is TYPED: a 409 warning comes back as the warning the
 *      screen shows, not as a swallowed null or a thrown error.
 *
 * The api client is stubbed (the canvas tests' idiom — the real one reads
 * `import.meta.env`, which only Vite defines). The stub builds its error the
 * way the real transport does: the envelope's message, code and details.
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const CLIENT_STUB = `
export const API_BASE = "http://bridge.test";
export class ApiError extends Error {
  constructor(message, status, code = "API_ERROR", details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function getActivePageJwt() { return "jwt"; }
async function send(method, path, body) {
  const res = await globalThis.__publishFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(
      errorBody?.error ?? errorBody?.message ?? (method + " " + path + " failed"),
      res.status,
      errorBody?.code ?? "API_ERROR",
      errorBody?.details,
    );
  }
  if (res.status === 204) return undefined;
  return res.json();
}
export const api = {
  get: (path) => send("GET", path, undefined),
  post: (path, body) => send("POST", path, body),
  patch: (path, body) => send("PATCH", path, body),
  delete: (path) => send("DELETE", path, undefined),
};
`;
// The owner's view of gated content is publishedView's (publish-owner-view.test.ts);
// here it is whatever the test says, so the body can be checked for it.
const OWNER_VIEW_STUB = `export async function shownForPublish(pageId) { return globalThis.__ownerView(pageId); }`;
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/api/client") return { url: url(CLIENT_STUB), shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/api/client.ts")) return { url: url(CLIENT_STUB), shortCircuit: true };
    if (resolved.url.endsWith("/src/features/share/publishedView.ts")) return { url: url(OWNER_VIEW_STUB), shortCircuit: true };
    return resolved;
  },
});
let ownerView: (pageId: string) => string[] = () => [];
Reflect.set(globalThis, "__ownerView", async (pageId: string) => ownerView(pageId));

const { publishPage } = await import("@/features/share/publishApi");
const { publishApp } = await import("@/features/marketplace/model/useMarketplaceApps");
const { createCommunity } = await import("@/shared/social/communityApi");

interface Recorded {
  path: string;
  method: string;
  body?: Record<string, unknown>;
}

const recorded: Recorded[] = [];
const WARNING_BODY = {
  ok: false,
  code: "moderation_warning",
  message: "This may hurt someone. Edit it, or post it anyway.",
  reasons: ["blocklist"],
  terms: ["foul"],
  details: { reasons: ["blocklist"], terms: ["foul"] },
};
const json = (value: unknown, status: number) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/** What the bridge answers, per call. The test says. */
let respond: (path: string, method: string, body?: Record<string, unknown>) => Response = () =>
  json({ ok: true }, 200);

Reflect.set(globalThis, "__publishFetch", async (path: string, init: { method: string; body?: string }) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  recorded.push({ path, method: init.method, body });
  return respond(path, init.method, body);
});

const last = (): Recorded => recorded[recorded.length - 1];

test("publishPage asks without the answer: the body carries no acknowledgement", async () => {
  respond = () => json({ ok: true, token: "token-1" }, 200);
  const result = await publishPage("page-1");
  assert.equal(result.ok, true);
  assert.equal(last().path, "/api/pages/page-1/publish");
  assert.deepEqual(last().body, { shown: [] });
});

test("publishPage carries the answer when the author says publish anyway", async () => {
  respond = () => json({ ok: true, token: "token-1" }, 200);
  const result = await publishPage("page-1", { acknowledgeWarning: true });
  assert.equal(result.ok, true);
  assert.deepEqual(last().body, { shown: [], acknowledgeWarning: true });
});

// #61: the bridge publishes a gated block or cell only when the publish names it.
test("publishPage sends the gated ids the owner's view of that page shows", async () => {
  respond = () => json({ ok: true, token: "token-1" }, 200);
  ownerView = (pageId) => (pageId === "page-1" ? ["cell-shown", "block-shown"] : []);
  await publishPage("page-1");
  ownerView = () => [];
  assert.deepEqual(last().body, { shown: ["cell-shown", "block-shown"] });
});

test("publishPage answers a 409 with the warning, not with an error", async () => {
  respond = () => json(WARNING_BODY, 409);
  const result = await publishPage("page-1");
  assert.equal(result.ok, false);
  assert.ok(!result.ok && "warning" in result, "the answer is not a warning");
  assert.equal(!result.ok && "warning" in result ? result.warning.terms[0] : "", "foul");
  assert.deepEqual(last().body, { shown: [] });
});

test("publishApp maps a 409 warning to the warning", async () => {
  respond = () => json(WARNING_BODY, 409);
  const result = await publishApp("app-1");
  assert.equal(result.ok, false);
  assert.ok(!result.ok && "warning" in result, "the answer is not a warning");
  assert.deepEqual(!result.ok && "warning" in result ? result.warning.reasons : [], ["blocklist"]);
});

test("publishApp maps a 500 to a message", async () => {
  respond = () => json({ ok: false, message: "The marketplace is down." }, 500);
  const result = await publishApp("app-1");
  assert.equal(result.ok, false);
  assert.equal(!result.ok && "message" in result ? result.message : "", "The marketplace is down.");
});

test("publishApp maps a 200 to the published app", async () => {
  respond = () => json({ _id: "app-1", title: "Acme" }, 200);
  const result = await publishApp("app-1");
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected the published app");
  assert.equal(result.app._id, "app-1");
  assert.equal(last().path, "/api/marketplace/publish");
});

test("publishApp carries the answer when the author says publish anyway", async () => {
  respond = () => json({ _id: "app-1", title: "Acme" }, 200);
  await publishApp("app-1", { acknowledgeWarning: true });
  assert.deepEqual(last().body, { pageId: "app-1", acknowledgeWarning: true });
});

test("createCommunity forwards the answer only when it is given", async () => {
  respond = () => json({ community: { id: "community-1", name: "Acme" } }, 201);
  await createCommunity({ name: "Acme" });
  assert.deepEqual(last().body, { name: "Acme" });
  await createCommunity({ name: "Acme" }, { acknowledgeWarning: true });
  assert.deepEqual(last().body, { name: "Acme", acknowledgeWarning: true });
});

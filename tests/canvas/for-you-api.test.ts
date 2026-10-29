/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   for-you-api.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client's half of the "For you" routes: the request each function sends,
 * what it answers when there is no bridge to talk to, and the sentence that
 * explains a page of the slate.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchForYou,
  markNotInterested,
  setForYouBridge,
  type ForYouBridge,
} from "@/features/recs/api/forYou";
import { whyText } from "@/features/recs/model/whyText";

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

/** A bridge that records the request instead of sending it. */
function recorder(answer: unknown = { ok: true, personalized: true, items: [] }) {
  const calls: Recorded[] = [];
  const bridge: ForYouBridge = {
    baseUrl: "http://bridge.test",
    jwt: () => "session-token",
    call: async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
      calls.push({ method, path, body });
      return answer as T;
    },
  };
  return { calls, bridge };
}

/** A bridge that is not there: no API configured. */
function offline() {
  const calls: Recorded[] = [];
  const bridge: ForYouBridge = {
    baseUrl: "",
    jwt: () => null,
    call: async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
      calls.push({ method, path, body });
      return {} as T;
    },
  };
  return { calls, bridge };
}

/** A bridge whose call fails with the status the route answered. */
function failing(status: number) {
  const bridge: ForYouBridge = {
    baseUrl: "http://bridge.test",
    jwt: () => "session-token",
    call: async () => {
      throw Object.assign(new Error(`the route answered ${status}`), { status });
    },
  };
  return bridge;
}

const ITEMS = [
  {
    pageId: "page-1",
    title: "The near page",
    icon: null,
    workspaceId: "ws-1",
    rank: 1,
    why: { kind: "because", pageId: "page-0", title: "The liked page", event: "liked" },
  },
];

test("fetchForYou asks the bridge for the slate, and answers its items", async () => {
  const { calls, bridge } = recorder({
    ok: true,
    personalized: true,
    recId: "rec-1",
    slate: "signed-slate",
    items: ITEMS,
  });
  setForYouBridge(bridge);
  const result = await fetchForYou();
  assert.deepEqual(calls, [{ method: "GET", path: "/api/recs/for-you", body: undefined }]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.personalized, true);
  assert.equal(result.ok && result.value.slate, "signed-slate");
  assert.equal(result.ok && result.value.items.length, 1);
  assert.equal(result.ok && result.value.items[0].pageId, "page-1");
});

test("a 404 is 'unavailable', not a failure — the strip is optional", async () => {
  setForYouBridge(failing(404));
  const result = await fetchForYou();
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "unavailable");
});

test("a 500 is a failure, and never a fake slate", async () => {
  setForYouBridge(failing(500));
  const result = await fetchForYou();
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "failed");
});

test("with no API base every function answers 'unavailable', and sends nothing", async () => {
  const { calls, bridge } = offline();
  setForYouBridge(bridge);
  const answers = [await fetchForYou(), await markNotInterested("slate", "page-1")];
  for (const answer of answers) {
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.code, "unavailable");
  }
  assert.deepEqual(calls, []);
});

test("markNotInterested sends the slate and the page, and nothing else", async () => {
  const { calls, bridge } = recorder({ ok: true, recorded: true });
  setForYouBridge(bridge);
  const result = await markNotInterested("signed-slate", "page-1");
  assert.deepEqual(calls, [
    {
      method: "POST",
      path: "/api/recs/not-interested",
      body: { slate: "signed-slate", pageId: "page-1" },
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.recorded, true);
});

test("a refusal the server did not record says so", async () => {
  const { bridge } = recorder({ ok: true, recorded: false });
  setForYouBridge(bridge);
  const result = await markNotInterested("signed-slate", "page-1");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.recorded, false);
});

test("the 'why' names the event the user did, on a page of their own", () => {
  const events = ["liked", "commented", "shared", "saved"] as const;
  for (const event of events) {
    assert.equal(
      whyText({ kind: "because", pageId: "page-0", title: "The liked page", event }),
      `Because you ${event} “The liked page”`,
    );
  }
});

test("a page with no explanation is 'suggested from your activity'", () => {
  assert.equal(whyText({ kind: "for_you" }), "Suggested from your activity");
  assert.equal(whyText(null), "Suggested from your activity");
});

test("a long title is cut, and marked as cut", () => {
  const title = "x".repeat(200);
  const text = whyText({ kind: "because", pageId: "page-0", title, event: "liked" });
  assert.equal(text, `Because you liked “${"x".repeat(60)}…”`);
  assert.ok(text.length < 100);
});

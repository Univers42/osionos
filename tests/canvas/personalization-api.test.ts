/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   personalization-api.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client's half of the personalization routes: the request each function
 * sends, and what it answers when there is no bridge to talk to.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  clearActivity,
  downloadActivity,
  readPersonalization,
  setPersonalizationBridge,
  writePersonalization,
  type PersonalizationBridge,
} from "@/features/settings/api/personalization";

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

/** A bridge that records the request instead of sending it. */
function recorder(answer: unknown = { ok: true, captureExplicit: true }) {
  const calls: Recorded[] = [];
  const bridge: PersonalizationBridge = {
    baseUrl: "http://bridge.test",
    jwt: () => "session-token",
    call: async <T>(method: "GET" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> => {
      calls.push({ method, path, body });
      return answer as T;
    },
  };
  return { calls, bridge };
}

/** A bridge that is not there: no API configured. */
function offline() {
  const calls: Recorded[] = [];
  const bridge: PersonalizationBridge = {
    baseUrl: "",
    jwt: () => null,
    call: async <T>(method: "GET" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> => {
      calls.push({ method, path, body });
      return {} as T;
    },
  };
  return { calls, bridge };
}

test("readPersonalization asks the bridge for the switch", async () => {
  const { calls, bridge } = recorder({ ok: true, captureExplicit: false });
  setPersonalizationBridge(bridge);
  const result = await readPersonalization();
  assert.deepEqual(calls, [{ method: "GET", path: "/api/personalization", body: undefined }]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.captureExplicit, false);
});

test("readPersonalization reads the default when the server has no row", async () => {
  const { bridge } = recorder({ ok: true });
  setPersonalizationBridge(bridge);
  const result = await readPersonalization();
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.captureExplicit, true);
  // The beacon is opt-in: no row, no beacon (C48).
  assert.equal(result.ok && result.value.beaconConsent, false);
});

test("writePersonalization sends the switch, and nothing but the switch", async () => {
  const { calls, bridge } = recorder({ ok: true, captureExplicit: false });
  setPersonalizationBridge(bridge);
  const result = await writePersonalization({ captureExplicit: false });
  assert.deepEqual(calls, [
    { method: "PUT", path: "/api/personalization", body: { captureExplicit: false } },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.captureExplicit, false);
});

test("downloadActivity asks for the log of the session user", async () => {
  const { calls, bridge } = recorder({ ok: true, events: [{ id: 1, event: "like" }] });
  setPersonalizationBridge(bridge);
  const result = await downloadActivity();
  assert.deepEqual(calls, [{ method: "GET", path: "/api/personalization/activity", body: undefined }]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.events.length, 1);
  assert.equal(result.ok && result.value.events[0].event, "like");
});

test("downloadActivity answers the vectors derived from the user", async () => {
  const factors = {
    user_vectors: [{ model_id: 3, status: "champion", factors: 16, vector: [0.5, -0.25] }],
    as_item: [],
  };
  const { bridge } = recorder({ ok: true, events: [], derived: { factors } });
  setPersonalizationBridge(bridge);
  const result = await downloadActivity();
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value.derived, { factors });
});

test("downloadActivity answers no vectors when the bridge sends none", async () => {
  const { bridge } = recorder({ ok: true, events: [] });
  setPersonalizationBridge(bridge);
  const result = await downloadActivity();
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value.derived, { factors: null });
});

test("clearActivity asks for the erasure, with no body", async () => {
  const { calls, bridge } = recorder({ ok: true, erased: 3 });
  setPersonalizationBridge(bridge);
  const result = await clearActivity();
  assert.deepEqual(calls, [{ method: "DELETE", path: "/api/personalization/activity", body: undefined }]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.erased, 3);
});

test("with no API base every function answers 'not available', and sends nothing", async () => {
  const { calls, bridge } = offline();
  setPersonalizationBridge(bridge);
  const answers = [
    await readPersonalization(),
    await writePersonalization({ captureExplicit: false }),
    await downloadActivity(),
    await clearActivity(),
  ];
  for (const answer of answers) {
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.code, "unavailable");
  }
  assert.deepEqual(calls, []);
});

test("a call that fails is a failure, never a fake success", async () => {
  const bridge: PersonalizationBridge = {
    baseUrl: "http://bridge.test",
    jwt: () => "session-token",
    call: async () => {
      throw new Error("captureExplicit must be a boolean.");
    },
  };
  setPersonalizationBridge(bridge);
  const result = await writePersonalization({ captureExplicit: false });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "failed");
  assert.match(!result.ok ? result.message : "", /captureExplicit/);
});

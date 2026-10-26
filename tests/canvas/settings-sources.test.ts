/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-sources.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createStoreRecordSource } from "../../src/entities/block/model/bindingSources.ts";
import { createPreferencesSource } from "../../src/features/bindings/sources/preferences.ts";
import { createAccessibilitySource } from "../../src/features/bindings/sources/accessibility.ts";
import { createNotificationsSource } from "../../src/features/bindings/sources/notifications.ts";
import { createVoiceSource } from "../../src/features/bindings/sources/voice.ts";
import { createAiSource } from "../../src/features/bindings/sources/ai.ts";
import { listRecordSources } from "../../src/features/bindings/model/sourceRegistry.ts";

import "../../src/features/bindings/sources/index.ts";

function makeStore(initial: any) {
  let state = initial;
  const listeners = new Set<(next: any, prev: any) => void>();
  const store: any = {
    getState: () => state,
    subscribe: (cb: (next: any, prev: any) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setState: (next: any) => {
      const prev = state;
      state = next;
      for (const cb of [...listeners]) cb(state, prev);
    },
    get activeListeners() { return listeners.size; },
  };
  return store;
}

function userStore(activeUserId = "u1") {
  const store = makeStore({ activeUserId });
  (store as any).activeWorkspace = () => ({ _id: "ws-1" });
  return store;
}

test("registration: exactly the five settings sources", () => {
  const ids = listRecordSources().map((s) => s.id);
  assert.deepEqual(ids.sort(), [
    "settings:accessibility",
    "settings:ai",
    "settings:notifications",
    "settings:preferences",
    "settings:voice",
  ].sort());
});

test("viewer scope: no signed-in user => unavailable", () => {
  const u = userStore("");
  const prefsStore = makeStore({ data: null, loading: false, update: () => {}, hydrate: () => {} });
  const src = createPreferencesSource({ prefs: prefsStore, user: u });
  assert.equal(src.status(), "unavailable");
  assert.equal(src.get("weekStart"), undefined);
});

test("preferences: empty data defaults", () => {
  const u = userStore();
  const prefsStore = makeStore({ data: null, loading: false, update: () => {}, hydrate: () => {} });
  const src = createPreferencesSource({ prefs: prefsStore, user: u });
  assert.equal(src.get("weekStart"), "monday");
  assert.equal(src.get("privacy.viewHistory"), true);
  assert.equal(src.get("enterAddsNewline"), false);
});

test("preferences: spy writes exact patch", () => {
  const u = userStore();
  const calls: any[] = [];
  const prefsStore = makeStore({ data: { privacy: {}, desktop: {} }, loading: false, update: (p: any) => { calls.push(p); }, hydrate: () => {} });
  const src = createPreferencesSource({ prefs: prefsStore, user: u });
  src.set!("weekStart", "sunday");
  assert.deepEqual(calls[0], { weekStart: "sunday" });
  src.set!("privacy.viewHistory", false);
  assert.deepEqual(calls[1], { privacy: { viewHistory: false } });
});

test("preferences: per-field cost", () => {
  const u = userStore();
  let storeState: any = { data: { weekStart: "monday", privacy: { viewHistory: true } }, loading: false, update: null as any, hydrate: () => {} };
  const listeners = new Set<(next: any, prev: any) => void>();
  const store: any = {
    getState: () => storeState,
    subscribe: (cb: any) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
  storeState.update = (patch: any) => {
    const prev = storeState;
    const nextData = { ...prev.data, ...patch };
    if (patch.privacy) nextData.privacy = { ...prev.data.privacy, ...patch.privacy };
    storeState = { ...prev, data: nextData };
    for (const cb of [...listeners]) cb(storeState, prev);
  };
  const src = createPreferencesSource({ prefs: store, user: u });
  let weekCalls = 0;
  let viewCalls = 0;
  src.subscribe("weekStart", () => { weekCalls++; });
  src.subscribe("privacy.viewHistory", () => { viewCalls++; });
  storeState.update({ weekStart: "sunday" });
  assert.equal(weekCalls, 1);
  assert.equal(viewCalls, 0);
});

test("accessibility: spy maps hovercards", () => {
  const u = userStore();
  const calls: any[] = [];
  const appearance = { linkUnderline: "default", motion: "system", animatedImages: "play", hovercards: "on", urlPaste: "link" };
  const store = makeStore(appearance);
  (store as any).update = (p: any) => { calls.push(p); };
  const src = createAccessibilitySource({ appearance: store, user: u, updateAppearance: (p: any) => calls.push(p) });
  // ensure spy is updateAppearance
  const c2: any[] = [];
  const src2 = createAccessibilitySource({ appearance: store, user: u, updateAppearance: (p: any) => c2.push(p) });
  src2.set!("hovercards", false);
  assert.deepEqual(c2[0], { hovercards: "off" });
  src2.set!("motion", "reduce");
  assert.deepEqual(c2[1], { motion: "reduce" });
});

test("notifications: defaults and spy", () => {
  const u = userStore();
  const calls: any[] = [];
  const store = makeStore({ data: null, loading: false, update: (p: any) => { calls.push(p); }, hydrate: () => {} });
  const src = createNotificationsSource({ notifications: store, user: u });
  assert.equal(src.get("inApp.liveMeetingActivity"), true);
  assert.equal(src.get("email.alwaysSend"), false);
  src.set!("slack.mode", "all");
  // store data null => data?.slack undefined; patch slack {mode:all,...undefined}
  assert.equal(calls.length, 1);
});

test("voice: defaults and spy", () => {
  const u = userStore();
  const calls: any[] = [];
  const store = makeStore({ data: { dictationLanguage: "auto", readAloudVoiceURI: "", readAloudRate: 1, allowOnlineVoices: false }, update: (p: any) => { calls.push(p); } });
  const src = createVoiceSource({ voice: store, user: u });
  assert.equal(src.get("readAloudRate"), 1);
  src.set!("readAloudRate", 1.5);
  assert.deepEqual(calls[0], { readAloudRate: 1.5 });
});

test("ai: workspace id and spy", () => {
  const u = userStore();
  const calls: any[] = [];
  const aiData: any = { connectors: false, meetingNotesAutoRecord: false, searchEverywhereIndexing: false, summaries: true };
  const store = makeStore({ data: { "ws-1": aiData }, getData: (ws: string) => aiData, update: (ws: string, p: any) => { calls.push({ ws, p }); } });
  const src = createAiSource({ ai: store, user: u });
  assert.equal(src.get("connectors"), false);
  src.set!("connectors", true);
  assert.deepEqual(calls[0], { ws: "ws-1", p: { connectors: true } });
});

test("accessibility and voice unavailable without user", () => {
  const u = userStore("");
  const appearance = { linkUnderline: "default", motion: "system", animatedImages: "play", hovercards: "on", urlPaste: "link" };
  const aStore = makeStore(appearance);
  const vStore = makeStore({ data: { dictationLanguage: "auto", readAloudVoiceURI: "", readAloudRate: 1, allowOnlineVoices: false }, update: () => {} });
  const aSrc = createAccessibilitySource({ appearance: aStore, user: u });
  const vSrc = createVoiceSource({ voice: vStore, user: u });
  assert.equal(aSrc.status(), "unavailable");
  assert.equal(vSrc.status(), "unavailable");
});
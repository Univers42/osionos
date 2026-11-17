/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   storage-full-stores.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056 A5 on real stores. A preference refused by a full origin keeps its memory state and
// never throws; user content first makes room from the page caches; either refusal is shown once.
// Each store is noticed in one test only: the notice is once per store per session.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { QuotaStorage } from "./quota-storage.ts";
import "./window-events.ts";

const storage = new QuotaStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
// The browser: zustand's default persist storage and the theme read `window.localStorage`.
Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: globalThis });
Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: new URL("http://localhost/") });

const { useUIStore } = await import("../../src/shared/config/uiStore.ts");
const { useHomeVariantStore } = await import("../../src/widgets/home-variants/model/homeVariantStore.ts");
const { persistThemeMode } = await import("../../src/shared/config/theme.ts");
const { useChatStore } = await import("../../src/features/chat/model/useChatStore.ts");
const { useRealtimeMessagesStore } = await import("../../src/services/realtime-messages/index.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");

const PAGE_CACHE = "osio:pages:ws-cache";
const noticed = () => useToastStore.getState().toasts
  .filter((toast) => toast.title === "Browser storage is full")
  .map((toast) => toast.description?.split(":")[0]);

beforeEach(() => {
  storage.clear();
  useToastStore.getState().clear();
});

test("A5 a refused sidebar layout keeps its width in memory, does not throw, and is shown once", () => {
  storage.refused.add("ui-storage");
  assert.doesNotThrow(() => useUIStore.getState().setSidebarWidth(300));
  assert.doesNotThrow(() => useUIStore.getState().setSidebarWidth(320));
  assert.equal(useUIStore.getState().sidebarWidth, 320);
  assert.deepEqual(noticed(), ["Sidebar layout"]);
});

test("A5 a refused home view is still switched in memory and is shown", () => {
  storage.refused.add("osionos.home.variant");
  assert.doesNotThrow(() => useHomeVariantStore.getState().setVariant("graph"));
  assert.equal(useHomeVariantStore.getState().variant, "graph");
  assert.deepEqual(noticed(), ["Home view"]);
});

test("A5 a refused theme choice does not throw into the caller and is shown", () => {
  storage.limit = 0;
  assert.doesNotThrow(() => persistThemeMode("dark"));
  assert.deepEqual(noticed(), ["Theme"]);
});

test("A5 a chat write makes room from the page caches before it is refused", () => {
  storage.setItem(PAGE_CACHE, "x");
  storage.fullWhilePageCached.add("osionos.chat.v1");
  useChatStore.getState().createProject("kept");
  assert.equal(storage.getItem(PAGE_CACHE), null);
  assert.equal(JSON.parse(storage.getItem("osionos.chat.v1") ?? "{}").projects.at(-1).name, "kept");
  assert.deepEqual(noticed(), []);
});

test("A5 a chat write refused even after room was made keeps the chat and is shown", () => {
  storage.refused.add("osionos.chat.v1");
  assert.doesNotThrow(() => useChatStore.getState().createProject("memory only"));
  assert.equal(useChatStore.getState().projects.at(-1)?.name, "memory only");
  assert.deepEqual(noticed(), ["Chat"]);
});

test("A5 a realtime message makes room, and a refused one is still sent and shown", () => {
  storage.setItem(PAGE_CACHE, "x");
  storage.fullWhilePageCached.add("osionos:realtime-messages");
  useRealtimeMessagesStore.getState().sendMessage("t1", "u1", "Ann", "kept");
  assert.equal(storage.getItem(PAGE_CACHE), null);
  assert.match(storage.getItem("osionos:realtime-messages") ?? "", /"body":"kept"/);
  storage.refused.add("osionos:realtime-messages");
  assert.ok(useRealtimeMessagesStore.getState().sendMessage("t1", "u1", "Ann", "memory only"));
  assert.equal(useRealtimeMessagesStore.getState().messagesByThread.t1.at(-1)?.body, "memory only");
  assert.deepEqual(noticed(), ["Messages"]);
});

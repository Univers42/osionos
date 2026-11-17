/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   storage-full-settings.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056 A5 on the settings stores and the header templates. A preference a server read
// repopulates is never worth a page cache: refused, it is kept in memory and shown. Content
// whose only copy is the browser's first makes room from the page caches, in the stored
// format it always had. Each store is noticed in one test only (once per store per session).

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { QuotaStorage } from "./quota-storage.ts";
import "./window-events.ts";

const storage = new QuotaStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
// The browser: zustand's default persist storage reads `window.localStorage`.
Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: globalThis });
Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: new URL("http://localhost/") });

const { useUserPreferencesStore } = await import("../../src/store/settings/useUserPreferencesStore.ts");
const { useAiSettingsStore } = await import("../../src/store/settings/useAiSettingsStore.ts");
const { useHeaderTemplateStore } = await import("../../src/features/template-designer/model/headerTemplateStore.ts");
const { defaultPreferences } = await import("../../src/store/settings/defaults.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");

const PAGE_CACHE = "osio:pages:ws-cache";
const PREFERENCES = "osionos:settings:preferences";
const AI = "osionos:settings:ai";
const HEADERS = "osio-header-templates.v1";
const noticed = () => useToastStore.getState().toasts
  .filter((toast) => toast.title === "Browser storage is full")
  .map((toast) => toast.description?.split(":")[0]);

beforeEach(() => {
  storage.clear();
  useToastStore.getState().clear();
});

test("A5 a refused preference keeps memory, spares the page caches and is shown once", () => {
  storage.setItem(PAGE_CACHE, "x");
  storage.refused.add(PREFERENCES);
  const data = { ...defaultPreferences("u1"), timezone: "Europe/Paris" };
  assert.doesNotThrow(() => useUserPreferencesStore.setState({ data }));
  assert.doesNotThrow(() => useUserPreferencesStore.setState({ data: { ...data } }));
  assert.equal(useUserPreferencesStore.getState().data?.timezone, "Europe/Paris");
  assert.equal(storage.getItem(PAGE_CACHE), "x");
  assert.deepEqual(noticed(), ["Preferences"]);
});

test("A5 AI settings make room from the page caches and keep their stored format", () => {
  storage.setItem(PAGE_CACHE, "x");
  storage.fullWhilePageCached.add(AI);
  useAiSettingsStore.getState().update("w1", { accountContext: false });
  assert.equal(storage.getItem(PAGE_CACHE), null);
  const stored = JSON.parse(storage.getItem(AI) ?? "{}");
  assert.deepEqual(Object.keys(stored).sort(), ["state", "version"]);
  assert.equal(stored.version, 1);
  assert.equal(stored.state.data.w1.accountContext, false);
  assert.deepEqual(noticed(), []);
});

test("A5 AI settings refused even after room was made stay in memory and are shown", () => {
  storage.refused.add(AI);
  assert.doesNotThrow(() => useAiSettingsStore.getState().update("w2", { accountContext: false }));
  assert.equal(useAiSettingsStore.getState().getData("w2").accountContext, false);
  assert.deepEqual(noticed(), ["AI settings"]);
});

test("A5 a header template on a local database makes room, and a refused one is shown", () => {
  const template = { blocks: [] } as never;
  storage.setItem(PAGE_CACHE, "x");
  storage.fullWhilePageCached.add(HEADERS);
  useHeaderTemplateStore.getState().setOverride("db-1", template);
  assert.equal(storage.getItem(PAGE_CACHE), null);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(HEADERS) ?? "{}")), ["db-1"]);
  storage.refused.add(HEADERS);
  assert.doesNotThrow(() => useHeaderTemplateStore.getState().setOverride("db-2", template));
  assert.ok(useHeaderTemplateStore.getState().overrides["db-2"]);
  assert.deepEqual(noticed(), ["Header templates"]);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-commands.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P1-4: the '>' palette reaches every settings section AND every anchor, the
// matcher ranks a label above a keyword, and a ?settings= link resolves only to
// a registry section with one of ITS anchors.
//
// The graph under test pulls the api client and the auth barrel, which read
// `import.meta.env` at load (node has none) — both are stubbed here, as in
// top-bar-search-archived.test.ts. The settings nav is stubbed too: this file
// proves the COMMANDS and the LINK, not the tab they open.

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const CLIENT_STUB = `
export const API_BASE = "";
export class ApiError extends Error {}
export function getActivePageJwt() { return "jwt"; }
export function getActiveJwt() { return "jwt"; }
export const api = { get: (...a) => globalThis.__intentApi(...a), post: (...a) => globalThis.__intentApi(...a),
  patch: (...a) => globalThis.__intentApi(...a), delete: (...a) => globalThis.__intentApi(...a) };
`;
const USER_STORE_STUB = `
export const useUserStore = {
  getState: () => ({
    activeWorkspace: () => ({ _id: "ws-test" }),
    activeSession: () => ({ userId: "user-1", privateWorkspaces: [{ _id: "ws-test" }], sharedWorkspaces: [] }),
  }),
  subscribe: () => () => undefined,
};
`;
const AUTH_INDEX_STUB = `
export const useUserStore = {
  getState: () => ({
    activeWorkspace: () => ({ _id: "ws-test" }),
    activeSession: () => ({ userId: "user-1", privateWorkspaces: [{ _id: "ws-test" }], sharedWorkspaces: [] }),
  }),
  subscribe: () => () => undefined,
};
export const useIsAdmin = () => false;
`;
// The settings nav opens a TAB — out of scope here. The stub records what the
// commands ask for, so the wiring is still proven.
const SETTINGS_NAV_STUB = `
export const calls = [];
export function openSettings(section = "profile", anchor) { calls.push({ section, anchor }); }
`;
const BY_SUFFIX: [string, string][] = [
  ["/src/shared/api/client.ts", CLIENT_STUB],
  ["/src/features/auth/model/useUserStore.ts", USER_STORE_STUB],
  ["/src/features/auth/index.ts", AUTH_INDEX_STUB],
  ["/src/features/auth/model/userStore.helpers.ts", "export function pageApiJwtFromSessionToken(token) { return token; }"],
  ["/src/features/settings/model/settingsNav.ts", SETTINGS_NAV_STUB],
];

const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    for (const [suffix, code] of BY_SUFFIX) if (resolved.url.endsWith(suffix)) return { url: url(code), shortCircuit: true };
    if (resolved.url.endsWith(".json")) return { ...resolved, importAttributes: { ...context.importAttributes, type: "json" }, shortCircuit: true };
    return resolved;
  },
});

// The page-access gates read the user store off globalThis.
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({
    activeSession: () => ({ userId: "user-1", privateWorkspaces: [{ _id: "ws-test" }], sharedWorkspaces: [] }),
  }),
  subscribe: () => () => undefined,
});

const { settingsPaletteCommands } = await import("../../src/features/settings/model/settingsCommands.ts");
const { SETTINGS_SECTIONS } = await import("../../src/features/settings/model/sections.ts");
const { readSettingsDeepLink, applySettingsDeepLink } = await import("../../src/features/settings/model/settingsDeepLink.ts");
const { matchCommands } = await import("../../src/widgets/top-bar/model/search.ts");
const { useWorkspaceLayout } = await import("../../src/widgets/workspace-grid/model/workspaceLayout.ts");
const { DEFAULT_AUTOMATIONS } = await import("../../src/features/automations/model/defaultAutomations.ts");
const { comboSteps } = await import("../../src/features/automations/model/combo.ts");
const navStub = await import(url(SETTINGS_NAV_STUB));

const commands = settingsPaletteCommands();

test("one command per section and per anchor, with unique ids", () => {
  const anchors = SETTINGS_SECTIONS.reduce((total, section) => total + section.anchors.length, 0);
  assert.equal(commands.length, SETTINGS_SECTIONS.length + anchors, "one command per section and per anchor");

  const ids = commands.map((command) => command.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");

  for (const section of SETTINGS_SECTIONS) {
    const sectionCommand = commands.find((command) => command.id === `settings.${section.id}`);
    assert.ok(sectionCommand, `a command for the ${section.id} section`);
    assert.equal(sectionCommand.label, `Settings: ${section.title}`);
    assert.equal(sectionCommand.group, "Settings");
    assert.deepEqual(sectionCommand.keywords, [section.label]);

    for (const anchor of section.anchors) {
      const anchorCommand = commands.find((command) => command.id === `settings.${section.id}.${anchor.id}`);
      assert.ok(anchorCommand, `a command for the ${section.id}/${anchor.id} anchor`);
      assert.equal(anchorCommand.label, `Settings: ${section.title} › ${anchor.label}`);
      assert.equal(anchorCommand.group, "Settings");
      assert.deepEqual(anchorCommand.keywords, anchor.keywords);
    }
  }
});

test("running a command opens its section and its anchor", () => {
  navStub.calls.length = 0;
  const anchorCommand = commands.find((command) => command.id === "settings.profile.account-security");
  assert.ok(anchorCommand);
  anchorCommand.run();
  assert.deepEqual(navStub.calls, [{ section: "profile", anchor: "account-security" }]);

  navStub.calls.length = 0;
  const sectionCommand = commands.find((command) => command.id === "settings.notifications");
  assert.ok(sectionCommand);
  sectionCommand.run();
  assert.deepEqual(navStub.calls, [{ section: "notifications", anchor: undefined }]);
});

test("a keyword match finds an anchor whose label never says the word", () => {
  const results = matchCommands("passkey", commands);
  assert.ok(results.length > 0, "the keyword query finds something");
  assert.equal(results[0].id, "settings.profile.account-security");
});

test("a label match outranks a keyword match", () => {
  const results = matchCommands("delete", commands);
  const label = results.findIndex((result) => result.id === "settings.general.danger-zone");
  const keyword = results.findIndex((result) => result.id === "settings.profile.support");
  assert.ok(label >= 0, "the label match is listed");
  assert.ok(keyword >= 0, "the keyword match is listed");
  assert.ok(label < keyword, "the label match comes first");
});

test("a query that matches no keyword keeps the registry order", () => {
  const results = matchCommands("billing", commands);
  assert.deepEqual(results.map((result) => result.id), ["settings.billing", "settings.billing.billing"]);
});

test("a query matching nothing lists nothing", () => {
  assert.deepEqual(matchCommands("zzz-not-a-setting", commands), []);
});

test("a deep link resolves a section and one of its own anchors", () => {
  assert.deepEqual(readSettingsDeepLink({ search: "?settings=profile", hash: "#account-security" }), {
    section: "profile",
    anchor: "account-security",
  });
  assert.deepEqual(readSettingsDeepLink({ search: "?settings=notifications", hash: "" }), {
    section: "notifications",
  });
});

test("a deep link with an unknown section resolves to nothing", () => {
  assert.equal(readSettingsDeepLink({ search: "?settings=nope", hash: "" }), null);
  assert.equal(readSettingsDeepLink({ search: "?settings=", hash: "" }), null);
  assert.equal(readSettingsDeepLink({ search: "", hash: "" }), null);
  assert.equal(readSettingsDeepLink({ search: "?osio.automations=0", hash: "" }), null);
});

test("a deep link whose anchor belongs to another section drops the anchor", () => {
  assert.deepEqual(readSettingsDeepLink({ search: "?settings=profile", hash: "#billing" }), {
    section: "profile",
  });
  assert.deepEqual(readSettingsDeepLink({ search: "?settings=profile", hash: "#<img src=x>" }), {
    section: "profile",
  });
});

test("a deep link never resolves a hostile section id", () => {
  assert.equal(readSettingsDeepLink({ search: "?settings=__proto__", hash: "" }), null);
  assert.equal(readSettingsDeepLink({ search: "?settings=constructor", hash: "" }), null);
  assert.equal(readSettingsDeepLink({ search: "?settings=toString", hash: "" }), null);
});

test("applying a deep link opens the tab and drops the link from the URL", () => {
  const replaced: string[] = [];
  const location = { pathname: "/", search: "?settings=profile", hash: "#account-security" };
  Reflect.set(globalThis, "location", location);
  Reflect.set(globalThis, "history", {
    state: null,
    replaceState: (_state: unknown, _title: string, next: string) => { replaced.push(next); },
  });
  // The layout tree is replaced when the signed-in identity restores its tabs:
  // the link opens its tab after that, so the restore cannot drop it.
  useWorkspaceLayout.setState({ scope: "user-1:ws-test" });
  navStub.calls.length = 0;

  applySettingsDeepLink();

  assert.deepEqual(navStub.calls, [{ section: "profile", anchor: "account-security" }]);
  assert.deepEqual(replaced, ["/"], "the settings param and the hash are gone");
});

test("the mod+comma chord opens Settings and no other default binds it", () => {
  const settings = DEFAULT_AUTOMATIONS.find((automation) => automation.id === "open-settings");
  assert.ok(settings, "the Settings shortcut is seeded");
  assert.deepEqual(comboSteps(settings.trigger.combo), ["mod+,"]);
  assert.deepEqual(settings.actions, [{ type: "run_command", commandId: "openSettings" }]);

  const others = DEFAULT_AUTOMATIONS
    .filter((automation) => automation.id !== "open-settings" && automation.enabled)
    .filter((automation) => comboSteps(automation.trigger.combo).includes("mod+,"));
  assert.deepEqual(others, [], "no other seeded shortcut takes mod+comma");
});

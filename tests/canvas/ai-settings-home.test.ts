/** The AI Hub tab is retired: every piece of it is a Settings section or anchor, each control once. */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import test, { afterEach } from "node:test";
import type { FC } from "react";

import "./support/memory-local-storage.ts";
import { setAiServiceUrl } from "./support/ai-service-env.ts";

// After the support imports: their loader hook only reaches modules imported from here on.
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { SETTINGS_SECTIONS } = await import("@/features/settings/model/sections");
const { openSettings, useSettingsNav } = await import("@/features/settings/model/settingsNav");
const { AiPanel } = await import("@/features/settings/ai/AiPanel");
const { AiConnectionsSection } = await import("@/features/settings/ai/AiConnectionsSection");
const { AiAgentsSettings, AiSkillsSettings, AiMemorySettings } = await import("@/features/settings/ai/AiWorkspacePanels");
const { slashSettingsTarget } = await import("@/widgets/chat-shell/model/slashActionTarget");
const { CHAT_ACTIONS } = await import("@/features/ai/model/chatCommands");
const { useUserStore } = await import("@/features/auth");
const { useWorkspaceLayout } = await import("@/widgets/workspace-grid/model/workspaceLayout");

const NOT_CONFIGURED = "The AI service is not configured on this build";
const NO_WORKSPACE = "Join or create a workspace to manage its skills, memory and agents";
const GATED = [
  { name: "agents", panel: AiAgentsSettings, anchor: "ai-agents" },
  { name: "skills", panel: AiSkillsSettings, anchor: "ai-skills" },
  { name: "memory", panel: AiMemorySettings, anchor: "ai-memory" },
] as const;

const render = (component: FC) => renderToStaticMarkup(React.createElement(component));
const count = (html: string, needle: string) => html.split(needle).length - 1;
const anchorsOf = (id: string) => SETTINGS_SECTIONS.find((section) => section.id === id)?.anchors ?? [];

// renderToStaticMarkup reads zustand's server snapshot, but activeSession() and
// activeWorkspace() read the live state through get(), so setState reaches the markup.
const { sessions: signedOutSessions, activeUserId: signedOutUser } = useUserStore.getState();
function signInWithOneWorkspace(): void {
  useUserStore.setState({
    sessions: { u1: { userId: "u1", privateWorkspaces: [{ _id: "ws1", name: "One" }], sharedWorkspaces: [] } } as never,
    activeUserId: "u1",
  });
}

afterEach(() => {
  setAiServiceUrl("");
  useUserStore.setState({ sessions: signedOutSessions, activeUserId: signedOutUser });
});

test("the ai section anchors overview, usage, routing and the outgoing-context block; none is labelled Privacy", () => {
  const ids = anchorsOf("ai").map((anchor) => anchor.id);
  for (const id of ["ai-overview", "ai-usage", "ai-routing", "ai-privacy"]) assert.ok(ids.includes(id), `${id} is not an ai anchor`);
  const privacyLabelled = SETTINGS_SECTIONS.flatMap((section) => section.anchors).filter((anchor) => anchor.label === "Privacy");
  assert.equal(privacyLabelled.length, 1, "only Preferences › Privacy carries that label");
});

test("agents, skills and memory are their own sections, each with an anchor its word finds", () => {
  for (const { name, anchor } of GATED) {
    const found = anchorsOf(`ai_${name}`).find((entry) => entry.id === anchor);
    assert.ok(found, `ai_${name}#${anchor}`);
    assert.ok(found.keywords.includes(name), `${anchor} lacks the keyword ${name}`);
  }
  assert.ok(anchorsOf("ai_connections").some((anchor) => anchor.id === "mcp-servers"), "ai_connections#mcp-servers");
});

test("AS6: unconfigured, the ai panel still paints all four anchors", () => {
  const html = render(AiPanel);
  for (const id of ["ai-overview", "ai-usage", "ai-routing", "ai-privacy"]) {
    assert.ok(html.includes(`data-settings-anchor="${id}"`), `${id} missing on first paint`);
  }
  assert.ok(!html.includes("AI Hub"), "the panel no longer points at the Hub");
});

test("AS6: openSettings(ai, ai-routing) lands there and keeps one Settings tab", () => {
  useWorkspaceLayout.setState({ root: { type: "pane", id: "p1", tabs: [], activeTabId: null }, activePaneId: "p1" });
  openSettings("ai", "ai-routing");
  openSettings("ai", "ai-routing");
  assert.deepEqual({ section: useSettingsNav.getState().section, anchor: useSettingsNav.getState().anchor }, { section: "ai", anchor: "ai-routing" });
  const root = useWorkspaceLayout.getState().root;
  assert.equal(root.type === "pane" ? root.tabs.filter((tab) => tab.kind === "settings").length : -1, 1);
});

test("AS7: no AI service — each workspace panel says so, under its anchor", () => {
  for (const { name, panel, anchor } of GATED) {
    const html = render(panel);
    assert.ok(html.includes(NOT_CONFIGURED), name);
    assert.ok(html.includes(`data-settings-anchor="${anchor}"`), `${name} anchor`);
  }
});

test("AS7: a service but no workspace — each workspace panel says so", () => {
  setAiServiceUrl("https://ai.test");
  for (const { name, panel } of GATED) assert.ok(render(panel).includes(NO_WORKSPACE), name);
});

test("AS1/AS2: with a service and a workspace, every AI control and panel renders exactly once across the AI sections", () => {
  setAiServiceUrl("https://ai.test");
  signInWithOneWorkspace();
  const connections = render(AiConnectionsSection);
  const html = [render(AiPanel), connections, ...GATED.map(({ panel }) => render(panel))].join("");
  for (const needle of [
    'aria-label="Account context"', 'aria-label="Allow web access"', 'aria-label="Sentiment"',
    'id="ws-skills-title"', 'id="ai-memory-title"', 'data-testid="agents-section"',
    'data-testid="mcp-servers-section"', "What your next message sends", ">Spent today<",
  ]) assert.equal(count(html, needle), 1, needle);
  assert.ok(connections.includes('data-settings-anchor="mcp-servers"'));
  assert.ok(!connections.includes('id="ws-skills-title"') && !connections.includes('id="ai-memory-title"'), "skills and memory left AI connections");
});

test("AS8: each settings slash command lands on an existing section and anchor", () => {
  const expected = {
    skills: ["ai_skills", "ai-skills"], memory: ["ai_memory", "ai-memory"],
    mcp: ["ai_connections", "mcp-servers"], routing: ["ai", "ai-routing"], hub: ["ai", undefined],
  } as const;
  for (const [name, [section, anchor]] of Object.entries(expected)) {
    assert.deepEqual(slashSettingsTarget(name), { section, anchor }, name);
    if (anchor) assert.ok(anchorsOf(section).some((entry) => entry.id === anchor), `${section}#${anchor} exists`);
  }
  assert.equal(slashSettingsTarget("model"), null);
  for (const action of CHAT_ACTIONS) assert.doesNotMatch(action.description, /AI Hub/i, action.name);
});

function srcFiles(dir: URL): URL[] {
  return readdirSync(dir).flatMap((entry) => {
    const url = new URL(entry, dir);
    if (statSync(url).isDirectory()) return srcFiles(new URL(`${entry}/`, dir));
    return /\.tsx?$/.test(entry) ? [url] : [];
  });
}
const SRC = new URL("../../src/", import.meta.url);
const srcLines = () => srcFiles(SRC).flatMap((url) =>
  readFileSync(url, "utf8").split("\n").map((line) => ({ file: url.pathname.slice(SRC.pathname.length), line })));

test("AS5: the Hub is gone; only the layout migration still names its kind", () => {
  assert.equal(existsSync(new URL("widgets/ai-hub", SRC)), false);
  assert.equal(existsSync(new URL("features/ai/model/aiHubNav.ts", SRC)), false);
  const hits = srcLines().filter(({ line }) => /"ai-hub"|__ai_hub__|openAiHub|aiHubTab|useAiHubNav/.test(line));
  assert.deepEqual(hits.map(({ file }) => file), ["widgets/workspace-grid/model/layoutPersist.ts"]);
});

// Caveat: structural, not behavioural — node has no DOM renderer here, so no effect runs and
// a request count cannot be observed. This holds the shape that makes "once per mount" true
// (one useUsage call site, whose effect has a stable dependency); a second call site added
// inside the same panel passes the markup tests above and fails only here.
test("AS11: usage is requested from one call site only", () => {
  const calls = srcLines().filter(({ line }) => line.includes("useUsage("));
  assert.equal(calls.length, 1, calls.map(({ file }) => file).join(", "));
});

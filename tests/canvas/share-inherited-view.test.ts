/* ************************************************************************** */
/*                                                                            */
/*  share-inherited-view.test.ts — the Share dialog shows what parent pages   */
/*  do to this page. The bridge decides which rules reach it (and which       */
/*  ancestors the caller may read); the dialog only renders that answer.      */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "./support/stub-bridge.ts";
import type { InheritedSectionProps } from "../../src/features/share/SharePopover.tsx";
import type { InheritedShareRow, ShareModel } from "../../src/features/share/useShareModel.ts";
import type { ShareAccessRule, ShareEntry, ShareLevel } from "../../src/features/share/types.ts";

// Loaded after stub-bridge registered the api client's Vite env, like the admin panels do.
const { fetchRules } = await import("../../src/features/share/shareApi.ts");
const { InheritedSection } = await import("../../src/features/share/SharePopover.tsx");

const CHILD_ENV = "SHARE_INHERITED_MODEL_CHILD";
const MODEL_CHILD = process.env[CHILD_ENV] === "1";

const ALICE = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const PEOPLE = [
  { id: ALICE, email: "alice@example.com", name: "Alice", role: "viewer" },
  { id: BOB, email: "bob@example.com", name: "Bob", role: "viewer" },
];

function rule(resourceId: string, permission: ShareLevel = "can_view", id = `rule-${resourceId}`): ShareAccessRule & { _id: string } {
  return {
    _id: id,
    workspaceId: "ws-g1",
    resourceId,
    resourceType: "page",
    target: { type: "user", userId: ALICE },
    permission,
    explicit: true,
  };
}

/** One entry a row can name; the model drops rules whose target is not in the roster. */
function entry(name: string, level: ShareLevel = "can_view"): ShareEntry {
  return { key: `user:${name}`, target: { type: "user", person: { id: name, name, email: "", role: "viewer" } }, level };
}

function inheritedRow(overrides: Partial<InheritedShareRow> = {}): InheritedShareRow {
  return {
    key: "row-1",
    entry: entry("Alice"),
    fromPageId: "page-parent",
    fromPageTitle: "Parent",
    reaches: true,
    denied: false,
    ...overrides,
  };
}

/** This file is .ts (the suite compiles .tsx only); render the section without JSX. */
function renderSection(props: InheritedSectionProps): string {
  return renderToStaticMarkup(React.createElement(InheritedSection, props));
}

/** Runs a shareApi call against a stubbed fetch and returns the URLs it asked for. */
async function withFetch(body: unknown, run: (calls: string[]) => Promise<void>, status = 200): Promise<void> {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

/* ── The read ───────────────────────────────────────────────────────────── */

test("fetchRules asks for inherited rows in one read and defaults an old bridge's absent fields", async () => {
  const body = {
    rules: [rule("PAGE-1"), rule("page-2"), { ...rule(""), _id: "wide" }],
    teamRules: false,
  };
  await withFetch(body, async (calls) => {
    const read = await fetchRules("ws-g1", "page-1");
    assert.equal(calls.length, 1, "one request per dialog open");
    assert.match(calls[0], /inherited=1/);
    assert.deepEqual(read.rules.map((item) => item._id), [`rule-PAGE-1`], "the own-rule filter stays");
    assert.deepEqual(read.inherited, []);
    assert.equal(read.hiddenInherited, false);
  });
});

test("fetchRules keeps the bridge's inherited rows in order and its hidden signal", async () => {
  const inherited = [
    { rule: rule("page-a", "can_edit"), fromPageId: "page-a", reaches: true },
    { rule: rule("page-b", "no_access"), fromPageId: "page-b", reaches: false },
  ];
  await withFetch({ rules: [], teamRules: true, inherited, hiddenInherited: true }, async () => {
    const read = await fetchRules("ws-g1", "page-child");
    assert.deepEqual(read.inherited, inherited);
    assert.equal(read.hiddenInherited, true);
    assert.equal(read.teamRules, true);
  });
});

/* ── The section ────────────────────────────────────────────────────────── */

test("no rows and no hidden restriction means no section (an old bridge)", () => {
  const html = renderSection({ rows: [], hiddenInherited: false, onOpenSource: () => {} });
  assert.equal(html, "");
});

test("a hidden ancestor restriction is one neutral line, even with no rows", () => {
  const html = renderSection({ rows: [], hiddenInherited: true, onOpenSource: () => {} });
  assert.match(html, /Inherited from parent pages/);
  assert.match(html, /Other restrictions above this page may apply\./);
});

test("non-reaching rows stay visible with the reason; deny and grant rows say what they do", () => {
  const title60 = "x".repeat(60);
  const html = renderSection({
    rows: [
      inheritedRow({ key: "muted", fromPageId: "page-a", fromPageTitle: "Roadmap", reaches: false }),
      inheritedRow({ key: "deny", fromPageId: "page-b", fromPageTitle: "Team home", denied: true, entry: entry("Bob", "no_access") }),
      inheritedRow({ key: "grant", fromPageId: "page-c", fromPageTitle: title60, entry: entry("Alice", "can_edit") }),
    ],
    hiddenInherited: false,
    onOpenSource: () => {},
  });
  assert.match(html, /Does not apply here — .*Roadmap/);
  assert.match(html, /is not this page.{0,8}s owner.{0,8}s private parent\./);
  assert.match(html, /No access — set on .*Team home.*; it overrides access granted here\./);
  assert.match(html, /from .*can affect this page\./);
  assert.match(html, /Can edit/);
  assert.doesNotMatch(html, /has access/i);
  assert.match(html, /text-\[var\(--osio-fg-muted\)\]/, "a non-reaching row is de-emphasised");
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, new RegExp(title60));
});

test("the source is a button only when the page is in the store", () => {
  const closed = renderSection({ rows: [inheritedRow()], hiddenInherited: false, onOpenSource: () => {}, isOpenable: () => false });
  assert.doesNotMatch(closed, /aria-label="Open /);
  const open = renderSection({ rows: [inheritedRow()], hiddenInherited: false, onOpenSource: () => {}, isOpenable: () => true });
  assert.match(open, /aria-label="Open Parent"/);
});

test("more than five rows collapse behind an aria-expanded control", () => {
  const rows = Array.from({ length: 200 }, (_, index) => inheritedRow({
    key: `row-${index}`,
    fromPageId: `page-${index}`,
    fromPageTitle: `Parent ${index}`,
  }));
  const html = renderSection({ rows, hiddenInherited: false, onOpenSource: () => {} });
  assert.match(html, /<section aria-labelledby=/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls=/);
  assert.match(html, /Show 200 inherited/);
});

/* ── The model (module-mocked child, like share-races) ──────────────────── */

interface FakeHooks {
  hooks: Record<string, unknown>;
  begin: () => void;
  takeEffect: () => (() => void) | undefined;
}

function fakeHooks(): FakeHooks {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let slot = 0;
  let refSlot = 0;
  let effect: (() => void) | undefined;
  return {
    hooks: {
      useState(initial: unknown) {
        const index = slot++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value: unknown) => {
          states[index] = typeof value === "function" ? (value as (old: unknown) => unknown)(states[index]) : value;
        }];
      },
      useRef(initial: unknown) {
        const index = refSlot++;
        return refs[index] ??= { current: initial };
      },
      useCallback: (fn: unknown) => fn,
      useMemo: (fn: () => unknown) => fn(),
      useEffect: (fn: () => void) => { effect = fn; },
    },
    begin() { slot = 0; refSlot = 0; },
    takeEffect() { return effect; },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function loadModel(): Promise<{
  read: () => ShareModel;
  reply: (next: () => Promise<unknown>) => void;
  done: () => void;
}> {
  const { isolatedModule } = await import("./fixtures/isolatedModule.ts");
  const fake = fakeHooks();
  let answer: () => Promise<unknown> = async () => ({ rules: [], teamRules: false, inherited: [], hiddenInherited: false });
  const module = await isolatedModule("src/features/share/useShareModel.ts", {
    react: fake.hooks,
    "src/features/share/shareApi.ts": {
      fetchWorkspacePeople: async () => PEOPLE,
      fetchPageSharing: async () => ({ visibility: "private", collaborators: [], version: 1 }),
      fetchRules: () => answer(),
      fetchPeople: async () => PEOPLE,
      fetchTeams: async () => [],
      commitPageSharing: async (_id: unknown, _before: unknown, after: unknown) => after,
      deleteRule: async () => {},
      saveRule: async () => ({}),
    },
    "src/features/share/sharePolicyApi.ts": {
      createPolicy: async () => ({}), deletePolicy: async () => {}, fetchPolicies: async () => [], fetchRoles: async () => [],
    },
  });
  const pages = [
    { _id: "page-a", title: "Parent A", workspaceId: "ws-g1" },
    { _id: "page-b", title: "Parent B", workspaceId: "ws-g1" },
  ];
  const read = () => {
    fake.begin();
    return module.useShareModel({ workspaceId: "ws-g1", resourceId: "page-child" }, pages);
  };
  read();
  const cleanup = fake.takeEffect();
  await tick();
  return {
    read,
    reply(next) { answer = next; },
    done() { cleanup?.(); },
  };
}

if (MODEL_CHILD) {
  test("the model maps the bridge's rows nearest-first, keeping reaches and denied", async () => {
    const model = await loadModel();
    try {
      model.reply(async () => ({
        rules: [],
        teamRules: false,
        inherited: [
          { rule: { ...rule("page-a", "can_edit"), target: { type: "user", userId: ALICE } }, fromPageId: "page-a", reaches: true },
          { rule: { ...rule("page-b", "no_access"), target: { type: "user", userId: BOB } }, fromPageId: "page-b", reaches: false },
          { rule: { ...rule("page-c", "can_view"), target: { type: "user", userId: BOB } }, fromPageId: "page-c", reaches: true },
        ],
        hiddenInherited: false,
      }));
      const current = model.read();
      await current.refresh();
      const refreshed = model.read();
      assert.deepEqual(refreshed.inherited.map((row) => [row.fromPageId, row.entry.level, row.reaches, row.denied]), [
        ["page-a", "can_edit", true, false],
        ["page-b", "no_access", false, true],
        ["page-c", "can_view", true, false],
      ]);
      assert.equal(refreshed.inherited[0].fromPageTitle, "Parent A");
      assert.equal(refreshed.inherited[2].fromPageTitle, "a parent page", "an unknown source never shows a raw id");
      assert.equal(refreshed.error, null);
    } finally {
      model.done();
    }
  });

  test("a 404 is the dialog's error state and leaves no stale rows behind", async () => {
    const model = await loadModel();
    try {
      model.reply(async () => ({
        rules: [], teamRules: false,
        inherited: [{ rule: rule("page-a"), fromPageId: "page-a", reaches: true }],
        hiddenInherited: true,
      }));
      const first = model.read();
      await first.refresh();
      assert.equal(model.read().inherited.length, 1);

      model.reply(async () => { throw Object.assign(new Error("Not found"), { status: 404 }); });
      const second = model.read();
      await second.refresh();
      const failed = model.read();
      assert.equal(failed.error, "This page is not available.");
      assert.deepEqual(failed.inherited, []);
      assert.equal(failed.hiddenInherited, false);
    } finally {
      model.done();
    }
  });

  test("an old bridge response has no inherited rows and no hidden signal", async () => {
    const model = await loadModel();
    try {
      model.reply(async () => ({ rules: [], teamRules: false }));
      const current = model.read();
      await current.refresh();
      const old = model.read();
      assert.deepEqual(old.inherited, []);
      assert.equal(old.hiddenInherited, false);
      assert.equal(old.error, null);
    } finally {
      model.done();
    }
  });
} else {
  test("the share model honours the bridge's inherited rows", () => {
    const env = { ...process.env, [CHILD_ENV]: "1" };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--experimental-loader",
      fileURLToPath(new URL("./ts-extension-loader.mjs", import.meta.url)),
      "--experimental-test-module-mocks", "--test", "--test-reporter=tap",
      fileURLToPath(new URL("./share-inherited-view.test.ts", import.meta.url)),
    ], { encoding: "utf8", timeout: 15_000, env });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /# tests 10\b/, result.stdout + result.stderr);
  });
}

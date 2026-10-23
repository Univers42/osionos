/* ************************************************************************** */
/*  ai-sentiment-rows.test.ts — the AI sentiment property (M6, C138–C155):    */
/*  the closed row labels, the opt-in-gated adapter, the workspace a push     */
/*  names, and the kit's read-only select through the source the app aliases. */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import { setAiTransport } from "../../src/features/ai/api/aiClient";
import { parseRowSentiments } from "../../src/features/ai/model/sentimentRows";
import { resetSentimentOptInCache } from "../../src/features/settings/ai/sentimentOptInCache";
import { readAutofillLabels, resetRowSentimentCache } from "../../src/widgets/database-view/model/databaseAutofill";
import { objectDatabasePushBodyFor } from "../../src/widgets/database-view/model/objectDatabaseBridgeSync";
import {
  rememberDatabaseWorkspace,
  resetObjectDatabaseWorkspaces,
} from "../../src/widgets/database-view/model/objectDatabaseWorkspaces";
import { useUserStore } from "../../src/features/auth/model/useUserStore";
import type { NotionState } from "../../src/shared/notion-database-sys/packages/contract-types/src/index.ts";
import { renderCellContent, type CellRendererProps } from "../../src/shared/notion-database-sys/src/components/views/table/CellRenderer.tsx";
import { AutofillSelectCell, AUTOFILL_EMPTY } from "../../src/shared/notion-database-sys/src/components/views/table/cellRenderers/AutofillCellRenderer.tsx";
import { SelectEditor } from "../../src/shared/notion-database-sys/src/components/views/table/SelectEditors.tsx";
import type { Page, SchemaProperty } from "../../src/shared/notion-database-sys/src/types/database";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Every fetch the AI client makes in one test. */
function stubFetch(answer: (url: string) => Response): string[] {
  const calls: string[] = [];
  setAiTransport(async (input) => {
    const url = String(input);
    calls.push(url);
    return answer(url);
  });
  return calls;
}

function clean(workspaceId = "ws-1"): void {
  resetSentimentOptInCache();
  resetRowSentimentCache();
  resetObjectDatabaseWorkspaces();
  rememberDatabaseWorkspace("db-x", workspaceId);
}

/* ── Parser ─────────────────────────────────────────────────────────────── */

test("the row labels are the closed set: an unknown label is dropped, an array or a non-object refused, {} kept", () => {
  assert.deepEqual(parseRowSentiments({ "row-1": "positive", "row-2": "angry" }), { "row-1": "positive" });
  assert.deepEqual(parseRowSentiments({}), {});
  assert.equal(parseRowSentiments(["positive"]), null);
  assert.equal(parseRowSentiments("positive"), null);
  assert.equal(parseRowSentiments(null), null);
});

/* ── Adapter ────────────────────────────────────────────────────────────── */

test("C138 an off workspace is {} and never asks for rows", async () => {
  clean();
  const calls = stubFetch(() => json({ enabled: false }));
  assert.deepEqual(await readAutofillLabels("db-x", "prop-sentiment"), {});
  assert.equal(calls.some((url) => url.includes("/sentiment/rows")), false);
});

test("an on workspace maps row id to label", async () => {
  clean();
  stubFetch((url) =>
    url.endsWith("/settings") ? json({ enabled: true }) : json({ "row-1": "positive", "row-2": "angry" }));
  assert.deepEqual(await readAutofillLabels("db-x", "prop-sentiment"), { "row-1": "positive" });
});

test("two concurrent reads make one rows request", async () => {
  clean();
  const calls = stubFetch((url) => (url.endsWith("/settings") ? json({ enabled: true }) : json({ "row-1": "neutral" })));
  const [first, second] = await Promise.all([
    readAutofillLabels("db-x", "prop-sentiment"),
    readAutofillLabels("db-x", "prop-sentiment"),
  ]);
  assert.deepEqual(first, { "row-1": "neutral" });
  assert.deepEqual(second, { "row-1": "neutral" });
  assert.equal(calls.filter((url) => url.includes("/sentiment/rows")).length, 1);
});

test("a broken AI service is {} — the database view still renders", async () => {
  clean();
  stubFetch((url) => (url.endsWith("/settings") ? json({ enabled: true }) : json({ error: "down" }, 503)));
  assert.deepEqual(await readAutofillLabels("db-x", "prop-sentiment"), {});
});

/* ── Workspace identity of a push ───────────────────────────────────────── */

test("the push body names the database's workspace from the map, not the active one", () => {
  resetObjectDatabaseWorkspaces();
  rememberDatabaseWorkspace("db-x", "ws-map");
  useUserStore.setState({
    activeUserId: "user-1",
    sessions: { "user-1": { privateWorkspaces: [{ _id: "ws-active" }], sharedWorkspaces: [] } },
  } as never);
  const slice = { databases: {}, pages: {}, views: {} } as NotionState;
  assert.equal(objectDatabasePushBodyFor("db-x", "Deals", slice).workspaceId, "ws-map");
  assert.equal(objectDatabasePushBodyFor("db-never-seen", "Deals", slice).workspaceId, undefined);
});

/* ── The kit's read-only select, through the aliased source ─────────────── */

const now = "2026-10-23T00:00:00.000Z";
const prop: SchemaProperty = {
  id: "prop-sentiment",
  name: "Sentiment",
  type: "select",
  options: [{ id: "positive", value: "positive", color: "bg-success-surface-muted text-success-text-tag" }],
};
const page: Page = {
  id: "row-1",
  databaseId: "db-x",
  properties: {},
  content: [],
  createdAt: now,
  updatedAt: now,
  createdBy: "test",
  lastEditedBy: "test",
};

function cellProps(overrides: Partial<SchemaProperty> = {}, isEditing = true): CellRendererProps {
  return {
    prop: { ...prop, ...overrides },
    page,
    value: null,
    isEditing,
    wrapContent: false,
    databaseId: "db-x",
    onUpdate: () => undefined,
    onStopEditing: () => undefined,
    onOpenPage: () => undefined,
    onFormulaEdit: () => undefined,
    onPropertyConfig: () => undefined,
    tableRef: { current: null },
    storeApi: {} as never,
  };
}

test("an AI-filled select has no editor; a plain select still edits", () => {
  const autofilled = renderCellContent(cellProps({ autofill: { kind: "sentiment", sourcePropertyIds: ["prop-title"] } }, true)) as React.ReactElement;
  assert.equal(autofilled.type, AutofillSelectCell);
  assert.notEqual(autofilled.type, SelectEditor, "an AI-filled select never mounts the editor");

  const plain = renderCellContent(cellProps({}, true)) as React.ReactElement;
  assert.equal(plain.type, SelectEditor, "a select without autofill still opens its editor");
});

test("with no adapter the AI-filled cell shows — and never writes page.properties", () => {
  const before = JSON.stringify(page.properties);
  const html = renderToString(React.createElement(AutofillSelectCell, cellProps({ autofill: { kind: "sentiment", sourcePropertyIds: ["prop-title"] } }, false)));
  assert.ok(html.includes(AUTOFILL_EMPTY), `the empty label is rendered, got ${html}`);
  assert.equal(JSON.stringify(page.properties), before, "the label is display-only, never state");
});

// Gate-off build (VITE_LEGACY_SECOND_BRAIN=false): every second-brain entry point opens
// the graph_render graph instead of the legacy one, and the host keeps the element's
// rules. Runs in its own CI job (playwright.config ignores this folder otherwise), on
// vite dev, so React StrictMode mounts each view twice. The element is a stub
// (./support.mjs); groot's CI checks the real one.

import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { activateFirstEditor, clearAndTypePageTitle, openFreshPage, pageTitleEditor, pasteText, waitForRenderStability } from "../../browser/core/app.mjs";
import { BASE, VIEW, expectNewGraph, installStub, stubLog } from "./support.mjs";

test.beforeAll(() => {
  // Not a skip: this folder only means something in a gate-off build.
  expect(process.env.VITE_LEGACY_SECOND_BRAIN, "run this folder with VITE_LEGACY_SECOND_BRAIN=false").toBe("false");
});

async function createPage(page, baseURL, title) {
  await openFreshPage(page, baseURL);
  // A fresh page may already hold "Untitled" as its value: replace it, never append.
  await clearAndTypePageTitle(page, title);
  await waitForRenderStability(page);
  await expect(pageTitleEditor(page)).toHaveValue(title);
  // The page just created is the open one; its id is what the bridge would put in a node id.
  const active = await page.evaluate(() => JSON.parse(localStorage.getItem("pg:activePage") ?? "null"));
  expect(typeof active?.id, "pg:activePage names the open page").toBe("string");
  return active.id;
}

// The page's row in the sidebar tree: the page context menu (Open with …) lives there.
function treeRow(page, title) {
  return page.locator('button[title^="Double-click to rename"]', { hasText: title });
}

async function openFromRail(page) {
  // The icon rail exists only while the sidebar is collapsed to it (sidebarRail.spec.mjs).
  await page.getByRole("button", { name: "Collapse to rail" }).click();
  await page.getByRole("tablist", { name: "Activity bar" }).getByRole("tab", { name: "Home", exact: true }).click();
  await page.getByRole("menuitem", { name: "Second Brain" }).click();
}

test("entry 1: rail Home → Second Brain opens the new graph", async ({ page, baseURL }) => {
  await installStub(page);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await openFromRail(page);
  await expectNewGraph(page.locator(VIEW));
  await expect(page.locator("canvas.osio-graph__fg")).toHaveCount(0);
});

test("entry 2: ?home=graph opens the new graph", async ({ page }) => {
  await installStub(page);
  await page.goto("/?home=graph", { waitUntil: "domcontentloaded" });
  await expectNewGraph(page.locator(VIEW));
});

test('entries 3/5/6: a stored "graph" variant restores the new graph in the Home tab, value kept', async ({ page }) => {
  await installStub(page);
  await page.addInitScript(() => localStorage.setItem("osionos.home.variant", "graph"));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectNewGraph(page.locator(VIEW));
  expect(await page.evaluate(() => localStorage.getItem("osionos.home.variant"))).toBe("graph");
});

test("D9: wasm is set before connect, each element connects once, remember is never set", async ({ page }) => {
  await installStub(page);
  await page.goto("/?home=graph", { waitUntil: "domcontentloaded" });
  await expectNewGraph(page.locator(VIEW));
  const log = await stubLog(page);
  expect(log.connects.length).toBeGreaterThan(0);
  for (const connect of log.connects) {
    expect(connect.wasm).toBe(new URL(`${BASE}graph_wasm.wasm`, page.url()).href);
    expect(connect.remember).toBe(false);
    expect(connect.times, "an element connected a second time was moved").toBe(1);
  }
  // No session in the offline test build: the host still loads an (empty) graph and says why.
  expect(log.loads.at(-1)).toEqual({ version: 1, nodes: [], edges: [] });
  await expect(page.locator(VIEW).getByRole("status")).toHaveText("Sign in to see your pages in the graph.");
});

test("node-open on a page node opens that page in a tab", async ({ page, baseURL }) => {
  await installStub(page);
  const id = await createPage(page, baseURL, "Graph Target");
  await openFromRail(page);
  await expectNewGraph(page.locator(VIEW));
  await page.locator(`${VIEW} graph-studio`).evaluate((el, nodeId) => {
    el.dispatchEvent(new CustomEvent("node-open", { bubbles: true, composed: true, detail: { id: nodeId, via: "enter" } }));
  }, `osionos:osionos_pages:${id}`);
  await expect(page.locator('textarea[aria-label="Page title"]:visible').first()).toHaveValue("Graph Target", { timeout: 15_000 });
});

/**
 * Stands in for the bridge at the app's own api client (the offline build has none): GET
 * `/api/pages/<id>` and POST `/api/records/…/open` answer with an entry the page store has
 * never held, built on the open page's workspace and owner so the session may read it. Every
 * other call goes to the real client. Returns what the fake was asked for.
 */
async function serveFromFakeBridge(page, routes) {
  await page.evaluate(async (served) => {
    const { api } = await import("/src/shared/api/client.ts");
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const open = usePageStore.getState().activePage;
    const template = usePageStore.getState().pageById(open.id);
    const entry = (fake) => ({ ...template, parentPageId: null, ...fake });
    const calls = (globalThis.__fakeBridgeCalls = []);
    const real = { get: api.get, post: api.post };
    api.get = (path, ...rest) => {
      calls.push(`GET ${path}`);
      return served.get[path] ? Promise.resolve(entry(served.get[path])) : real.get(path, ...rest);
    };
    api.post = (path, ...rest) => {
      calls.push(`POST ${path}`);
      return served.post[path] ? Promise.resolve(entry(served.post[path])) : real.post(path, ...rest);
    };
  }, routes);
}

async function openNode(page, nodeId) {
  await page.locator(`${VIEW} graph-studio`).evaluate((el, id) => {
    el.dispatchEvent(new CustomEvent("node-open", { bubbles: true, composed: true, detail: { id, via: "enter" } }));
  }, nodeId);
}

function storeHas(page, pageId) {
  return page.evaluate(async (id) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    return usePageStore.getState().pageById(id) != null;
  }, pageId);
}

test("node-open on a page only the bridge holds opens it with its content, not a Loading pane", async ({ page, baseURL }) => {
  await installStub(page);
  await createPage(page, baseURL, "Graph Host Page");
  const id = randomUUID();
  const body = "This body lives only on the bridge";
  await serveFromFakeBridge(page, {
    get: { [`/api/pages/${id}`]: { _id: id, title: "Server Only Page", content: [{ id: "srv-b1", type: "paragraph", content: body }] } },
    post: {},
  });
  expect(await storeHas(page, id), "the page is not in the client store").toBe(false);
  await openFromRail(page);
  await expectNewGraph(page.locator(VIEW));
  await openNode(page, `osionos:osionos_pages:${id}`);
  await expect(page.locator('textarea[aria-label="Page title"]:visible').first()).toHaveValue("Server Only Page", { timeout: 15_000 });
  await expect(page.getByText(body)).toBeVisible();
  expect(await page.evaluate(() => globalThis.__fakeBridgeCalls)).toContain(`GET /api/pages/${id}`);
});

test("node-open on a database record opens the record's note, as the legacy graph did", async ({ page, baseURL }) => {
  await installStub(page);
  await createPage(page, baseURL, "Graph Record Host");
  const noteId = randomUUID();
  const body = "Note behind order 42";
  const openPath = "/api/records/db1/orders/42/open";
  await serveFromFakeBridge(page, {
    get: {},
    post: { [openPath]: { _id: noteId, title: "Order 42", content: [{ id: "rec-b1", type: "paragraph", content: body }] } },
  });
  await openFromRail(page);
  await expectNewGraph(page.locator(VIEW));
  await openNode(page, "db1:orders:42");
  await expect(page.locator('textarea[aria-label="Page title"]:visible').first()).toHaveValue("Order 42", { timeout: 15_000 });
  await expect(page.getByText(body)).toBeVisible();
  expect(await page.evaluate(() => globalThis.__fakeBridgeCalls)).toContain(`POST ${openPath}`);
});

test('entry 7: "Open in graph" opens the new graph and focuses the page', async ({ page, baseURL }) => {
  await installStub(page);
  const id = await createPage(page, baseURL, "Focus Me");
  await treeRow(page, "Focus Me").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open with" }).click();
  await page.getByRole("menuitem", { name: "Open in graph" }).click();
  await expectNewGraph(page.locator(VIEW));
  await expect.poll(async () => (await stubLog(page)).focuses).toContain(`osionos:osionos_pages:${id}`);
});

test("entries 8/9/10: an ```osigraph fence becomes a graph_view block drawn by the new graph, editor and read-only", async ({ page, baseURL }) => {
  await installStub(page);
  await createPage(page, baseURL, "Graph Block");
  await pasteText(await activateFirstEditor(page), "```osigraph\n{}\n```");
  const inEditor = page.locator(`[aria-label="Graph block"] ${VIEW}`);
  await expectNewGraph(inEditor);
  await expect(inEditor.getByRole("group", { name: "Graph scope" }), "a block has a fixed scope").toHaveCount(0);
  // Raw mode previews the page with the read-only renderer (ReadOnlyBlock).
  await treeRow(page, "Graph Block").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open with" }).click();
  await page.getByRole("menuitem", { name: "Open as raw markdown" }).click();
  await expectNewGraph(page.locator(`${VIEW}:not([aria-label="Graph block"] *)`).first());
});

test("a refused load is shown once and not reported again from graph-error", async ({ page }) => {
  const { warnings } = await installStub(page, { refuse: true });
  await page.goto("/?home=graph", { waitUntil: "domcontentloaded" });
  const view = page.locator(VIEW);
  await expect(view).toHaveAttribute("data-graph-state", "error", { timeout: 20_000 });
  await expect(view.getByRole("alert")).toHaveCount(1);
  await expect(view.getByRole("alert")).toContainText('The graph could not load: osionos: duplicate node id "x"');
  expect(warnings).toEqual([]);
});

for (const [name, opts, words] of [
  ["no graph-studio-base meta (an image without the pack)", { meta: false }, "no graph-studio-base meta"],
  ["a pack that speaks another host API", { moduleHostApi: 3 }, "host API 3"],
  ["an element that speaks another host API", { elementHostApi: 3 }, "host API 3"],
  ["a pack with another wasm ABI", { abi: 3 }, "ABI 3"],
]) {
  test(`never a blank graph: ${name} shows why`, async ({ page }) => {
    await installStub(page, opts);
    await page.goto("/?home=graph", { waitUntil: "domcontentloaded" });
    const view = page.locator(VIEW);
    await expect(view).toHaveAttribute("data-graph-state", "unavailable", { timeout: 20_000 });
    await expect(view.getByRole("alert")).toContainText(`Graph unavailable: `);
    await expect(view.getByRole("alert")).toContainText(words);
    await expect(view.locator("graph-studio")).toHaveCount(0);
  });
}

// Gate-off build (VITE_LEGACY_SECOND_BRAIN=false): every second-brain entry point opens
// the graph_render graph instead of the legacy one, and the host keeps the element's
// rules. Runs in its own CI job (playwright.config ignores this folder otherwise), on
// vite dev, so React StrictMode mounts each view twice. The element is a stub
// (./support.mjs); groot's CI checks the real one.

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

async function openFromRail(page) {
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

test('entry 7: "Open in graph" opens the new graph and focuses the page', async ({ page, baseURL }) => {
  await installStub(page);
  const id = await createPage(page, baseURL, "Focus Me");
  await page.getByText("Focus Me", { exact: true }).first().click({ button: "right" });
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
  await page.getByText("Graph Block", { exact: true }).first().click({ button: "right" });
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

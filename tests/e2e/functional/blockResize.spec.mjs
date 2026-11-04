// Resizable blocks are centred on the page column and may grow past it into both margins, up to
// the pane: dragging a side moves both sides by the same amount, the top and bottom edges change
// the height. A block wider than its pane keeps its width and scrolls in its own band, never
// clipped, with its grips still reachable. One shared frame (BlockResizeFrame) drives them all.

import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { frameableSnapshot, seedPage } from "../support/embedSeed.mjs";
import { mockHydrawn } from "../support/whiteboardMocks.mjs";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const BLOCKS = [
  { type: "table_block", block: { id: "t1", type: "table_block", content: "", tableData: [["Name", "Stage"], ["Alpha", "Draft"], ["Beta", "Done"]] } },
  { type: "database_inline", block: { id: "d1", type: "database_inline", content: "", databaseId: "db-products" } },
  { type: "whiteboard", block: { id: "w1", type: "whiteboard", content: "Plan", boardSlug: "abc123def456", whiteboardHeight: 400 } },
  { type: "embed", block: { id: "e1", type: "embed", content: "https://example.com/app", embed: frameableSnapshot("https://example.com/app") } },
  { type: "code", block: { id: "c1", type: "code", content: "const answer = 42;\nconsole.log(answer);", language: "javascript" } },
];

// Every case also proves the drag logs nothing: no error, no warning.
// Caveat: the dev build's `[perf]` span warnings (over 4 ms, perf-probe) are skipped: they time
// the machine, not the code, and a reload's cache save trips them on a loaded runner.
let consoleNoise = [];
test.beforeEach(async ({ page }) => {
  consoleNoise = [];
  page.on("console", (message) => {
    const isNoise = message.type() === "error" || message.type() === "warning";
    if (isNoise && !message.text().startsWith("[perf] ")) consoleNoise.push(`${message.type()}: ${message.text()}`);
  });
  await mockHydrawn(page);
  // CI has a network: the framed page must answer, or its 404 lands in the console.
  await page.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>app</title>" }));
  await page.route("https://img.example/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }));
});
test.afterEach(() => {
  expect(consoleNoise).toEqual([]);
});

const frameOf = (page, type) => page.locator(`[data-block-type="${type}"] [data-block-resize-frame]`).first();
const gripOf = (frame, edge) => frame.locator(`:scope > [data-resize-edge="${edge}"]`);
// The text column a width is a share of: the content box of the frame's band's parent.
const columnOf = (frame) => frame.evaluate((node) => {
  const column = node.closest("[data-block-breakout]").parentElement;
  const style = getComputedStyle(column);
  return { width: column.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) };
});
const paneOf = (page) => page.locator(".osionos-page").first().evaluate((node) => node.getBoundingClientRect().toJSON());

/** The share of every edge's length (25/50/75 %) where the hit target is that edge's grip. */
async function edgeHits(frame) {
  return frame.evaluate((node) => {
    const misses = [];
    for (const grip of node.querySelectorAll(":scope > [data-resize-edge]")) {
      const edge = grip.dataset.resizeEdge;
      if (edge.includes("-")) continue;
      const box = grip.getBoundingClientRect();
      for (const t of [0.25, 0.5, 0.75]) {
        const alongX = edge === "top" || edge === "bottom";
        const x = alongX ? box.left + box.width * t : box.left + box.width / 2;
        const y = alongX ? box.top + box.height / 2 : box.top + box.height * t;
        const hit = document.elementFromPoint(x, y);
        if (!grip.contains(hit)) misses.push(`${edge}@${t}: ${hit?.tagName}${hit?.getAttribute("aria-label") ? ` ${hit.getAttribute("aria-label")}` : ""}`);
      }
    }
    return misses;
  });
}

async function drag(page, frame, edge, dx, dy) {
  await frame.hover();
  const grip = gripOf(frame, edge);
  await grip.scrollIntoViewIfNeeded();
  const box = await grip.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

for (const { type, block } of BLOCKS) {
  test(`${type} at 1440px grows past the column into both margins and keeps it across a reload`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seedPage(page, baseURL, [block]);
    const frame = frameOf(page, type);
    await expect(frame).toBeVisible();
    expect(await edgeHits(frame)).toEqual([]);

    const column = await columnOf(frame);
    const before = await frame.boundingBox();
    // The pane is 1118 px at 1440 with the sidebar open: 150 px a side is inside what it holds.
    await drag(page, frame, "right", 150, 0);
    const after = await frame.boundingBox();
    expect(Math.abs(after.x + after.width - (before.x + before.width) - 150)).toBeLessThanOrEqual(2);
    expect(Math.abs(before.x - after.x - 150)).toBeLessThanOrEqual(2);
    expect(after.width).toBeGreaterThan(column.width + 100);
    const pane = await paneOf(page);
    expect(after.x).toBeGreaterThanOrEqual(pane.left);
    expect(after.x + after.width).toBeLessThanOrEqual(pane.right);
    expect(await edgeHits(frame)).toEqual([]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await explorerRow(page, "Embed seed").click();
    const kept = await frameOf(page, type).boundingBox();
    expect(Math.abs(kept.width - after.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(kept.x - after.x)).toBeLessThanOrEqual(2);
  });
}

test("an outward drag stops at the pane, minus its gutters", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedPage(page, baseURL, [BLOCKS[0].block]);
  const frame = frameOf(page, "table_block");
  await drag(page, frame, "right", 600, 0);
  const [box, pane] = [await frame.boundingBox(), await paneOf(page)];
  expect(Math.abs(box.width - (pane.width - 64))).toBeLessThanOrEqual(2);
  expect(Math.abs(box.x - pane.left - 32)).toBeLessThanOrEqual(2);
});

for (const { type, block } of BLOCKS) {
  test(`${type} at 390px, stored wider than the phone, scrolls in its band and its right grip still drags`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seedPage(page, baseURL, [{ ...block, mediaWidth: 150 }]);
    // Resized after the page is open: the phone layout opens on Home, not on the page.
    await page.setViewportSize({ width: 390, height: 844 });
    const frame = frameOf(page, type);
    await expect(frame).toBeVisible();
    const column = await columnOf(frame);
    const band = page.locator(`[data-block-type="${type}"] [data-block-breakout]`).first();
    const scroll = await band.evaluate((node) => ({ width: node.scrollWidth, client: node.clientWidth, overflowX: getComputedStyle(node).overflowX }));
    expect(scroll.overflowX).toBe("auto");
    expect(scroll.width).toBeGreaterThan(scroll.client);
    const width = (await frame.boundingBox()).width;
    expect(Math.abs(width - Math.round(column.width * 1.5))).toBeLessThanOrEqual(2);

    await drag(page, frame, "right", -30, 0);
    expect(Math.abs((await frame.boundingBox()).width - (width - 60))).toBeLessThanOrEqual(2);
  });
}

test("the top edge changes the height of a table, the bottom edge of code", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedPage(page, baseURL, [BLOCKS[0].block, BLOCKS[4].block]);
  const table = frameOf(page, "table_block");
  const before = await table.boundingBox();
  await drag(page, table, "top", 0, -50);
  expect(Math.abs((await table.boundingBox()).height - before.height - 50)).toBeLessThanOrEqual(2);

  const code = frameOf(page, "code");
  const codeBefore = await code.boundingBox();
  await drag(page, code, "bottom", 0, 60);
  expect(Math.abs((await code.boundingBox()).height - codeBefore.height - 60)).toBeLessThanOrEqual(2);
});

test("an image narrows from a side, stays centred, and never grows past its column", async ({ page, baseURL }) => {
  await seedPage(page, baseURL, [{ id: "i1", type: "image", content: "", asset: "https://img.example/tiny.png" }]);
  const frame = frameOf(page, "image");
  await expect(frame).toBeVisible();
  const before = await frame.boundingBox();
  await drag(page, frame, "right", 100, 0);
  expect(Math.abs((await frame.boundingBox()).width - before.width)).toBeLessThanOrEqual(2);
  await drag(page, frame, "right", -50, 0);
  const after = await frame.boundingBox();
  expect(Math.abs(after.width - (before.width - 100))).toBeLessThanOrEqual(2);
  expect(Math.abs(after.x - before.x - 50)).toBeLessThanOrEqual(2);
});

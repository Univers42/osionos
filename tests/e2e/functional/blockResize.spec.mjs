// Resizable blocks are centred in the page column: dragging a side moves both sides by the
// same amount, the top and bottom edges change the height, and a phone-width column clamps
// the width without a horizontal scroll. One shared frame (BlockResizeFrame) drives them all.

import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { frameableSnapshot, seedPage } from "../support/embedSeed.mjs";
import { mockHydrawn } from "../support/whiteboardMocks.mjs";

const BLOCKS = [
  { type: "table_block", block: { id: "t1", type: "table_block", content: "", tableData: [["Name", "Stage"], ["Alpha", "Draft"], ["Beta", "Done"]], mediaWidth: 60 } },
  { type: "whiteboard", block: { id: "w1", type: "whiteboard", content: "Plan", boardSlug: "abc123def456", whiteboardHeight: 400, mediaWidth: 60 } },
  { type: "embed", block: { id: "e1", type: "embed", content: "https://example.com/app", embed: frameableSnapshot("https://example.com/app"), mediaWidth: 60 } },
];

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// Every case also proves the drag logs nothing: no error, no warning.
// Caveat: the dev build's `[perf]` span warnings (over 4 ms, perf-probe) are skipped: they time
// the machine, not the code, and a reload's cache save trips them on a loaded runner.
let consoleNoise = [];
test.beforeEach(({ page }) => {
  consoleNoise = [];
  page.on("console", (message) => {
    const isNoise = message.type() === "error" || message.type() === "warning";
    if (isNoise && !message.text().startsWith("[perf] ")) consoleNoise.push(`${message.type()}: ${message.text()}`);
  });
});
test.afterEach(() => {
  expect(consoleNoise).toEqual([]);
});

const frameOf = (page, type) => page.locator(`[data-block-type="${type}"] [data-block-resize-frame]`).first();

// A block's own controls win where they overlap a grip (a table's "Add column" sits on the
// middle of its right edge), so the drag starts at the first point along the grip that is the grip.
async function grabPoint(frame, edge) {
  return frame.locator(`:scope > [data-resize-edge="${edge}"]`).evaluate((grip) => {
    const box = grip.getBoundingClientRect();
    const alongX = box.width > box.height;
    for (let t = 0.5, step = 0; step < 20; step += 1, t = 0.5 + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 0.05) {
      const x = alongX ? box.left + box.width * t : box.left + box.width / 2;
      const y = alongX ? box.top + box.height / 2 : box.top + box.height * t;
      if (grip.contains(document.elementFromPoint(x, y))) return [x, y];
    }
    throw new Error(`no free point on the ${grip.dataset.resizeEdge} grip`);
  });
}

async function drag(page, frame, edge, dx, dy) {
  await frame.hover();
  const [x, y] = await grabPoint(frame, edge);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  for (const { type, block } of BLOCKS) {
    test(`${type} at ${viewport.width}px: a side grows both sides alike, the top edge changes the height`, async ({ page, baseURL }) => {
      await mockHydrawn(page);
      // CI has a network: the framed page must answer, or its 404 lands in the console.
      await page.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>app</title>" }));
      await seedPage(page, baseURL, [block]);
      // Resized after the page is open: the phone layout opens on Home, not on the page.
      await page.setViewportSize(viewport);
      const frame = frameOf(page, type);
      await expect(frame).toBeVisible();
      const dx = viewport.width < 600 ? 20 : 60;

      const before = await frame.boundingBox();
      await drag(page, frame, "right", dx, 0);
      const after = await frame.boundingBox();
      const rightMoved = after.x + after.width - (before.x + before.width);
      const leftMoved = before.x - after.x;
      expect(rightMoved).toBeGreaterThan(dx / 2);
      expect(Math.abs(rightMoved - leftMoved)).toBeLessThanOrEqual(2);
      expect(after.x).toBeGreaterThanOrEqual(0);
      expect(after.x + after.width).toBeLessThanOrEqual(viewport.width);

      await drag(page, frame, "top", 0, -50);
      const taller = await frame.boundingBox();
      expect(Math.abs(taller.height - after.height - 50)).toBeLessThanOrEqual(2);
      expect(Math.abs(taller.width - after.width)).toBeLessThanOrEqual(2);

      // Neither the document nor any scroller around the block scrolls sideways.
      const overflow = await frame.evaluate((node) => {
        const widest = [];
        for (let el = node.parentElement; el; el = el.parentElement) {
          if (/(auto|scroll)/.test(getComputedStyle(el).overflowX)) widest.push(el.scrollWidth - el.clientWidth);
        }
        const root = document.documentElement;
        return Math.max(root.scrollWidth - root.clientWidth, ...widest);
      });
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("the left edge grows the width symmetrically and the size survives a reload", async ({ page, baseURL }) => {
  await seedPage(page, baseURL, [BLOCKS[0].block]);
  const frame = frameOf(page, "table_block");
  const before = await frame.boundingBox();
  await drag(page, frame, "left", -40, 0);
  const after = await frame.boundingBox();
  expect(Math.abs(before.x - after.x - 40)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.width - before.width - 80)).toBeLessThanOrEqual(2);
  await drag(page, frame, "bottom", 0, -30);
  const sized = await frame.boundingBox();

  await page.reload({ waitUntil: "domcontentloaded" });
  await explorerRow(page, "Embed seed").click();
  const kept = await frameOf(page, "table_block").boundingBox();
  expect(Math.abs(kept.width - sized.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(kept.height - sized.height)).toBeLessThanOrEqual(2);
});

test("an image narrows from a side and stays centred", async ({ page, baseURL }) => {
  await page.route("https://img.example/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG }));
  await seedPage(page, baseURL, [{ id: "i1", type: "image", content: "", asset: "https://img.example/tiny.png" }]);
  const frame = frameOf(page, "image");
  await expect(frame).toBeVisible();
  const before = await frame.boundingBox();
  await drag(page, frame, "right", -50, 0);
  const after = await frame.boundingBox();
  expect(Math.abs(after.width - (before.width - 100))).toBeLessThanOrEqual(2);
  expect(Math.abs(after.x - before.x - 50)).toBeLessThanOrEqual(2);
});

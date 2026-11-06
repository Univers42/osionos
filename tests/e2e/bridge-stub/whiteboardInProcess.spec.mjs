/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   whiteboardInProcess.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/04 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/04 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The inline whiteboard drawn in osionos' own page (`osio.whiteboard.inprocess`), saving to the
// bridge's whiteboard routes — stubbed here, in memory, the way scripts/bridge-whiteboard.mjs
// keeps them: whole scenes by rev, a 404 before the first save creates the board. A drawn
// rectangle is saved, survives a reload, and the console and the CSP report nothing.
// Caveat: the store is the stub's memory, not grobase; tests/bridge/bridge-whiteboard.test.mjs
// covers the real routes.

import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { seedSession } from "../support/bridgeSession.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";

const SLUG = "abcdefgh2345";
const PAGE = {
  _id: "6a1760000000000000000001",
  title: "Board page",
  workspaceId: "ws-bridge",
  ownerId: "user-bridge-spec",
  visibility: "private",
  collaborators: [],
  parentPageId: null,
  databaseId: null,
  archivedAt: null,
  updatedAt: "2026-11-04T00:00:00.000Z",
  content: [{ id: "wb-block", type: "whiteboard", content: "Sprint plan", boardSlug: SLUG }],
};

/** The bridge's whiteboard routes over one in-memory map, and every request made to them. */
function whiteboardBridge() {
  const boards = new Map();
  const calls = [];
  const now = () => new Date().toISOString();
  const answer = (url, request) => {
    const method = request.method();
    if (url.pathname === "/api/whiteboard/token" && method === "POST") {
      return { json: { ok: true, token: "wb-e2e", exp: Math.floor(Date.now() / 1000) + 600 } };
    }
    if (!url.pathname.startsWith("/api/whiteboard/v1/boards")) return null;
    calls.push({ method, path: url.pathname, auth: request.headers().authorization ?? "" });
    if (url.pathname === "/api/whiteboard/v1/boards" && method === "POST") {
      const { title, slug } = request.postDataJSON();
      // Idempotent under a sent slug, as the bridge's createOnce: the one it has, answered 200.
      const existing = boards.get(slug);
      if (existing) {
        const { scene, ...summary } = existing;
        void scene;
        return { json: summary };
      }
      const board = { slug, title, rev: 0, bounds: null, elementCount: 0, createdAt: now(), updatedAt: now(), thumbnailAt: null, scene: { type: "osidraw", version: 1, elements: [] } };
      boards.set(slug, board);
      const { scene, ...summary } = board;
      void scene;
      return { status: 201, json: summary };
    }
    const [, slug, thumbnail] = /^\/api\/whiteboard\/v1\/boards\/([^/]+)(\/thumbnail)?$/.exec(url.pathname) ?? [];
    if (thumbnail) return { status: 204 };
    const board = boards.get(slug);
    if (!board) return { status: 404, json: { error: { code: "not_found", message: "No such board." } } };
    if (method === "GET") return { json: board };
    if (method === "PUT") {
      const rev = Number(String(request.headers()["if-match"] ?? "").replaceAll('"', ""));
      if (rev !== board.rev) return { status: 409, json: { error: { code: "conflict", message: "The board changed since it was read." } } };
      Object.assign(board, { scene: request.postDataJSON(), rev: rev + 1, updatedAt: now() });
      return { json: board };
    }
    return { status: 405, json: { error: { code: "method_not_allowed", message: "No." } } };
  };
  return { boards, calls, answer };
}

const live = (board) => (board?.scene.elements ?? []).filter((element) => !element.isDeleted);

async function drawRectangle(page) {
  const canvas = page.getByTestId("whiteboard-inprocess").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("the board's canvas has no box");
  // Away from the chrome floating over the canvas: the toolbar at the top, the zoom bar below.
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 80);
  await page.keyboard.press("r");
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.6, { steps: 6 });
  await page.mouse.up();
}

test("a board drawn in the page is saved through the bridge and survives a reload", async ({ page, baseURL }) => {
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => {
    localStorage.setItem("osio.whiteboard.inprocess", "1");
    const violations = [];
    document.addEventListener("securitypolicyviolation", (event) => violations.push(`${event.effectiveDirective}: ${event.blockedURI}`), true);
    Object.defineProperty(window, "__violations", { value: violations });
  });

  const bridge = whiteboardBridge();
  await stubBridge(page, (url, request) => {
    const board = bridge.answer(url, request);
    if (board) return board;
    if (url.pathname === "/api/pages/all") return { json: [PAGE] };
    if (url.pathname === `/api/pages/${PAGE._id}` && request.method() === "GET") return { json: PAGE };
    return { json: {} };
  });
  await seedSession(page, {});

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, PAGE.title).click();
  const block = page.locator('[data-block-type="whiteboard"]');
  await expect(block.getByTestId("whiteboard-inprocess")).toBeVisible({ timeout: 20_000 });
  await expect(block.locator("iframe")).toHaveCount(0);

  await drawRectangle(page);
  await expect.poll(() => live(bridge.boards.get(SLUG)).map((element) => element.type), { timeout: 15_000 }).toEqual(["rectangle"]);
  const [drawn] = live(bridge.boards.get(SLUG));
  // The library only ever held the whiteboard token.
  expect(new Set(bridge.calls.map((call) => call.auth))).toEqual(new Set(["Bearer wb-e2e"]));

  await page.reload({ waitUntil: "domcontentloaded" });
  await explorerRow(page, PAGE.title).click();
  await expect(block.getByTestId("whiteboard-inprocess")).toBeVisible({ timeout: 20_000 });
  // Reopened from the bridge: selecting everything and deleting it deletes the rectangle the
  // reload brought back, which is only possible if the board loaded it.
  const blocksBefore = await block.count();
  await drawRectangleFocus(page);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect.poll(() => bridge.boards.get(SLUG)?.scene.elements.find((element) => element.id === drawn.id)?.isDeleted, { timeout: 15_000 }).toBe(true);
  // The keys stayed in the board: Delete took no osionos block with it.
  await expect(block).toHaveCount(blocksBefore);

  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(problems).toEqual([]);
});

/** Focus on the board, on an empty spot, without drawing anything. */
async function drawRectangleFocus(page) {
  const canvas = page.getByTestId("whiteboard-inprocess").locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("the board's canvas has no box");
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 80);
}

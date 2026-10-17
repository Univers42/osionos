// A stored `draw` block no longer renders a canvas: it shows a notice that offers to import
// the scene as a whiteboard, or to download it. The import succeeds only when the service
// reports the same number of live elements as were sent. The whiteboard is built in, so the
// import is offered with an empty installed map. https://localhost:3007 is mocked.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, pasteText } from "../../browser/core/app.mjs";
import { mockInstalled } from "../support/whiteboardMocks.mjs";

const SLUG = "abc123def456";
const SCENE = JSON.stringify({
  type: "osidraw",
  version: 1,
  elements: [{ id: "a", type: "rectangle" }, { id: "b", type: "ellipse" }],
});
const MARKDOWN = `\`\`\`osidraw h=400\n${SCENE}\n\`\`\``;

async function openPageWithDrawBlock(page, baseURL, keptElements) {
  await mockInstalled(page, {});
  await page.route("https://localhost:3007/**", (route) => {
    const request = route.request();
    if (request.method() === "POST") return route.fulfill({ status: 201, json: { slug: SLUG, title: "Untitled" } });
    if (request.method() === "PUT") {
      const elements = JSON.parse(request.postData()).elements.slice(0, keptElements);
      return route.fulfill({ status: 200, json: { slug: SLUG, scene: { elements } } });
    }
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><p>board</p>" });
  });
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await pasteText(editor, MARKDOWN);
  return page.locator('[data-block-type="draw"]');
}

test.describe("legacy draw block", () => {
  test("renders a notice, not a canvas, with both actions, with an empty installed map", async ({ page, baseURL }) => {
    const block = await openPageWithDrawBlock(page, baseURL, 2);
    await expect(block.getByRole("button", { name: /Import as whiteboard/ })).toBeVisible();
    await expect(block.getByRole("button", { name: /Download \.osidraw/ })).toBeVisible();
    await expect(block.locator("canvas")).toHaveCount(0);
  });

  test("Import as whiteboard converts the block when every element arrived", async ({ page, baseURL }) => {
    const block = await openPageWithDrawBlock(page, baseURL, 2);
    await block.getByRole("button", { name: /Import as whiteboard/ }).click();
    await expect(page.locator('[data-block-type="whiteboard"] iframe')).toHaveAttribute("src", new RegExp(`/boards/${SLUG}$`));
    await expect(page.locator('[data-block-type="draw"]')).toHaveCount(0);
  });

  test("a board that kept fewer elements leaves the drawing in place with Retry", async ({ page, baseURL }) => {
    const block = await openPageWithDrawBlock(page, baseURL, 1);
    await block.getByRole("button", { name: /Import as whiteboard/ }).click();
    await expect(block.getByRole("alert")).toContainText("kept 1 of 2");
    await expect(block.getByRole("button", { name: /Retry/ })).toBeVisible();
    await expect(page.locator('[data-block-type="whiteboard"]')).toHaveCount(0);
  });

  test("Download .osidraw saves the scene byte for byte", async ({ page, baseURL }) => {
    const block = await openPageWithDrawBlock(page, baseURL, 2);
    const download = page.waitForEvent("download");
    await block.getByRole("button", { name: /Download \.osidraw/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^drawing-.{8}\.osidraw$/);
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString("utf8")).toBe(SCENE);
  });
});

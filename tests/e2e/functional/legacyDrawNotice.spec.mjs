// A stored `draw` block no longer renders a canvas: it shows a notice that offers to download
// the scene as .osidraw, so no drawing is lost. Nothing converts it to a whiteboard: the retired
// Draw format is not hydrawn's.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, pasteText } from "../../browser/core/app.mjs";
import { mockInstalled } from "../support/whiteboardMocks.mjs";

const SCENE = JSON.stringify({
  type: "osidraw",
  version: 1,
  elements: [{ id: "a", type: "rectangle" }, { id: "b", type: "ellipse" }],
});
const MARKDOWN = `\`\`\`osidraw h=400\n${SCENE}\n\`\`\``;

async function openPageWithDrawBlock(page, baseURL) {
  await mockInstalled(page, {});
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await pasteText(editor, MARKDOWN);
  return page.locator('[data-block-type="draw"]');
}

test.describe("legacy draw block", () => {
  test("renders a notice with the download, not a canvas", async ({ page, baseURL }) => {
    const block = await openPageWithDrawBlock(page, baseURL);
    await expect(block.getByText("This drawing was made with the retired Draw tool.")).toBeVisible();
    await expect(block.getByRole("button", { name: /Download \.osidraw/ })).toBeVisible();
    await expect(block.getByRole("group", { name: "Retired drawing" }).getByRole("button")).toHaveCount(1);
    await expect(block.locator("canvas, iframe")).toHaveCount(0);
  });

  test("Download .osidraw saves the scene byte for byte", async ({ page, baseURL }) => {
    const block = await openPageWithDrawBlock(page, baseURL);
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

// The built-in whiteboard app: /whiteboard [name] creates a board and inserts an inline
// block that iframes it. Every account has it with no install step, so none of these cases
// installs anything or waits for the installed-apps endpoint. /draw and /drawing find it. The
// drawnosaurus service (https://localhost:3007) is mocked, so no real board is created.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  selectSlashMenuEntry,
} from "../../browser/core/app.mjs";
import { mockInstalled, mockWhiteboardFailure, mockWhiteboardService } from "../support/whiteboardMocks.mjs";

const SLUG = "abc123def456";

const whiteboardRows = (page) => page.getByTestId("slash-command-entry").filter({ hasText: /whiteboard/i });

test.describe("built-in whiteboard", () => {
  // /draw is a search word for the same command: the name after it is the board's name.
  for (const cmd of ["/whiteboard", "/draw"]) {
    test(`${cmd} <name> creates a named board and embeds it inline`, async ({ page, baseURL }) => {
      const created = [];
      await mockWhiteboardService(page, { slug: SLUG, title: "Sprint plan", onCreate: (body) => created.push(body) });
      await openFreshPage(page, baseURL);
      const editor = await activateFirstEditor(page);

      await openSlashMenuFromEditor(editor, `${cmd} Sprint plan`);
      await selectSlashMenuEntry(page, "Create board");

      const block = page.locator('[data-block-type="whiteboard"]');
      await expect(block.locator("iframe")).toHaveAttribute("src", new RegExp(`/boards/${SLUG}$`));
      await expect(block.getByText("Sprint plan")).toBeVisible();
      expect(created).toEqual([{ title: "Sprint plan" }]);
    });
  }

  test("/whiteboard Q3/Q4 plan keeps the slash inside the name", async ({ page, baseURL }) => {
    const created = [];
    await mockWhiteboardService(page, { slug: SLUG, title: "Sprint plan", onCreate: (body) => created.push(body) });
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);

    await openSlashMenuFromEditor(editor, "/whiteboard Q3/Q4 plan");
    await selectSlashMenuEntry(page, "Create board");

    await expect(page.locator('[data-block-type="whiteboard"] iframe')).toHaveAttribute("src", new RegExp(`/boards/${SLUG}$`));
    expect(created).toEqual([{ title: "Q3/Q4 plan" }]);
  });

  test("/whiteboard with no name creates an Untitled board; Open full opens it in its own tab", async ({ page, baseURL }) => {
    const created = [];
    await mockWhiteboardService(page, { slug: SLUG, title: "Sprint plan", onCreate: (body) => created.push(body) });
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/whiteboard");
    await selectSlashMenuEntry(page, "Whiteboard");

    await page.locator('[data-block-type="whiteboard"]').getByRole("button", { name: /Open full/ }).click();
    // The page tab goes inactive, so the inline block unmounts and the board tab's own frame remains.
    await expect(page.locator('[data-block-type="whiteboard"]')).toHaveCount(0);
    await expect(page.locator(`iframe[src$="/boards/${SLUG}"]`)).toBeVisible();
    expect(created).toEqual([{ title: "Untitled" }]);
  });

  test("a failed creation shows Retry and does not retry on its own", async ({ page, baseURL }) => {
    const posts = await mockWhiteboardFailure(page);
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/whiteboard");
    await selectSlashMenuEntry(page, "Whiteboard");

    const block = page.locator('[data-block-type="whiteboard"]');
    await expect(block.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(block.getByRole("alert")).toContainText("Board service is down.");
    await page.waitForTimeout(1_500);
    expect(posts.count).toBe(1);
  });

  test("the command is present with an empty installed map", async ({ page, baseURL }) => {
    await mockInstalled(page, {});
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/whiteboard");
    await expect(whiteboardRows(page)).toHaveCount(1);
  });

  test("/white also finds it", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/white");
    await expect(whiteboardRows(page)).toHaveCount(1);
  });

  for (const typed of ["/draw", "/drawing"]) {
    test(`${typed} finds the whiteboard row`, async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      const editor = await activateFirstEditor(page);
      await openSlashMenuFromEditor(editor, typed);
      await expect(whiteboardRows(page)).toHaveCount(1);
    });
  }
});

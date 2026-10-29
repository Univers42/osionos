// The page "…" menu follows Notion's groups: a search that filters rows one by
// one, Appearance & layout behind a side submenu, and Move to Trash in the
// danger tone. The workspace menu and the compose split control get the same
// treatment.

import { expect, test } from "@playwright/test";

import { clearAndTypePageTitle, openFreshPage, pageTitleEditor } from "../../browser/core/app.mjs";

async function openPageMenu(page) {
  await page.getByRole("button", { name: "Open page configuration" }).click();
  const menu = page.getByTestId("page-config-menu");
  await expect(menu).toBeVisible();
  return menu;
}

test.describe("Notion-style page chrome", () => {
  test("the page menu groups its actions and the search filters them", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const menu = await openPageMenu(page);

    for (const label of ["Copy link", "Move to", "Appearance & layout", "More", "Developer tools", "Move to Trash"]) {
      await expect(menu.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    // More and Developer tools sit behind side panels, so the menu fits without scrolling.
    await expect(menu.getByRole("button", { name: "Raw / code mode", exact: true })).toHaveCount(0);
    await expect(menu.getByTestId("debug-tool-outlines")).toHaveCount(0);
    const scroller = menu.locator(".overflow-y-auto");
    expect(await scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);

    await menu.getByPlaceholder("Search actions...").fill("trash");
    await expect(menu.getByRole("button", { name: "Move to Trash", exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Copy link", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("button")).toHaveCount(1);

    // A row behind a side panel is still one search away.
    await menu.getByPlaceholder("Search actions...").fill("raw");
    await expect(menu.getByRole("button", { name: "Raw / code mode", exact: true })).toBeVisible();
  });

  test("More and Developer tools open side panels, one at a time", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const menu = await openPageMenu(page);
    await menu.getByTestId("page-menu-more").click();
    const more = page.getByTestId("page-menu-more-panel");
    await expect(more.getByRole("button", { name: "Raw / code mode", exact: true })).toBeVisible();

    await menu.getByTestId("page-menu-tools").click();
    const tools = page.getByTestId("page-menu-tools-panel");
    await expect(more).toHaveCount(0);
    await tools.getByTestId("debug-tool-outlines").click();
    await expect(page.locator(".osionos-page").first()).toHaveAttribute("data-debug-outlines", "");
    await expect(menu.getByTestId("page-menu-tools")).toContainText("1 on");
    await tools.getByTestId("debug-tool-outlines").click();
  });

  test("Appearance & layout picks a font and turns full width on", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const menu = await openPageMenu(page);

    await menu.getByTestId("page-menu-appearance").click();
    const submenu = page.getByTestId("page-menu-appearance-panel");
    await expect(submenu).toBeVisible();

    await submenu.getByRole("button", { name: /^Ag\s*Serif$/ }).click();
    const root = page.locator(".osionos-page").first();
    await expect(root).toHaveClass(/osionos-page--font-serif/);

    const fullWidth = submenu.getByRole("button", { name: "Full width", exact: true });
    await expect(fullWidth).toHaveAttribute("aria-pressed", "false");
    await fullWidth.click();
    await expect(root).toHaveClass(/osionos-page--full-width/);
    await expect(fullWidth).toHaveAttribute("aria-pressed", "true");
  });

  test("the workspace menu reads like a workspace card", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: "More workspace options" }).click();
    const menu = page.getByTestId("workspace-menu");
    await expect(menu).toBeVisible();

    await expect(menu.getByRole("button", { name: /Settings/ })).toBeVisible();
    const invite = menu.getByRole("button", { name: /Invite members/ });
    await expect(invite).toBeVisible();
    // One line, like Notion's card: the label never wraps under the icon.
    expect((await invite.boundingBox()).height).toBeLessThanOrEqual(32);
    await expect(menu.getByText(/members?$/).first()).toBeVisible();
  });

  test("the compose split control offers page, chat and database", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await clearAndTypePageTitle(page, "Compose base");

    await page.getByRole("button", { name: "New…" }).click();
    const menu = page.getByTestId("compose-menu");
    await expect(menu.getByRole("button", { name: "Page", exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Chat", exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Database", exact: true })).toBeVisible();

    await menu.getByRole("button", { name: "Page", exact: true }).click();
    await expect(pageTitleEditor(page)).toHaveValue("Untitled");

    await page.getByRole("button", { name: "New…" }).click();
    await page.getByTestId("compose-menu").getByRole("button", { name: "Database", exact: true }).click();
    // The full-page database renders its table view, not a page-title textarea.
    await expect(page.getByRole("grid", { name: /Untitled database table/ })).toBeVisible();
  });
});

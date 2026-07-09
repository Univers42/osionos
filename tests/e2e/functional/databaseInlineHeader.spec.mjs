/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseInlineHeader.spec.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Notion collection-view header on inline database embeds: a fresh /database
// block materializes (no dead-end empty state), the header shows the title as
// a link + view tabs + toolbar, ··· exposes the view actions, minimize
// collapses the body, and the title link opens the database's ORIGIN tab.

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

async function insertInlineDatabase(page) {
  await openFreshPage(page, "/");
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/database");
  await slashCommandEntry(page, "Database - Inline").click();
  const block = page.locator(".osionos-database-block--inline").first();
  await block.waitFor({ timeout: 15_000 });
  return block;
}

test.describe("database-inline-header", () => {
  test("a fresh /database block materializes with the Notion header", async ({ page }) => {
    const block = await insertInlineDatabase(page);

    // Root repair: the host-minted id materializes — never the dead-end empty state.
    await expect(block.getByText("No database")).toHaveCount(0);
    await expect(block.getByText("Untitled Database").first()).toBeVisible({ timeout: 10_000 });

    // View tabs row is visible inline: active Table tab + add view + ··· menu.
    await expect(block.locator('[aria-label="Add view"]')).toBeVisible();
    await expect(block.locator('[aria-label="More options"]')).toBeVisible();

    // Toolbar: filter / sort / automations / search / open-as-full-page /
    // settings / split New — all present (hover-revealed by the embed CSS).
    // Icon-only in embeds (Notion parity) — assert by accessible name.
    await block.hover();
    await expect(block.locator('[aria-label="Filter"]')).toBeVisible();
    await expect(block.locator('[aria-label="Sort"]')).toBeVisible();
    await expect(block.locator('[aria-label="Automations"]')).toBeVisible();
    await expect(block.locator('[aria-label="Search"]')).toBeVisible();
    await expect(block.locator('[aria-label="Open as full page"]')).toBeVisible();
    await expect(block.locator('[aria-label="View settings"]')).toBeVisible();
    // Split New | ▾ — the engine-native templates controller backs every DB,
    // and the two segments align as one control (equal height, same top edge).
    const newBtn = block.locator(".odb-topbar-actions").getByRole("button", { name: "New", exact: true });
    const chevronBtn = block.locator('[aria-label="New from template"]');
    await expect(newBtn).toBeVisible();
    await expect(chevronBtn).toBeVisible();
    const [newBox, chevronBox] = [await newBtn.boundingBox(), await chevronBtn.boundingBox()];
    expect(Math.abs(newBox.height - chevronBox.height)).toBeLessThan(1);
    expect(Math.abs(newBox.y - chevronBox.y)).toBeLessThan(1);

    // The floating "Source" / "All rows" pills are gone from the block corner.
    await expect(block.getByText("All rows", { exact: true })).toHaveCount(0);
    await expect(block.getByRole("button", { name: "Source", exact: true })).toHaveCount(0);

    // The created database lands in the persisted registry (the "special place").
    const registry = await page.evaluate(() =>
      window.localStorage.getItem("osionos.databases.created.v1"));
    expect(registry).toContain("Untitled Database");
  });

  test("··· opens the view menu with the full action list", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.locator('[aria-label="More options"]').click();

    for (const label of [
      "Copy link to view", "Duplicate view", "View data source",
      "Edit title", "Edit icon", "Edit layout", "Hide title",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("minimize collapses the embed body and restores it", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();

    await expect(block.locator(".osionos-db-single-body")).toBeVisible();
    await block.locator('[aria-label="Minimize database"]').click();
    await expect(block.locator(".osionos-db-single-body")).toHaveCount(0);
    await block.locator('[aria-label="Expand database"]').click();
    await expect(block.locator(".osionos-db-single-body")).toBeVisible();
  });

  test("a record cover persists and shows on the gallery card; New-page tile stays short", async ({ page }) => {
    const block = await insertInlineDatabase(page);

    // Switch to a Gallery view (the add-view grid is portaled to body —
    // scope tiles to the panel, not the block or the whole page).
    await block.hover();
    await block.locator('[aria-label="Add view"]').click();
    const addViewPanel = page.getByTestId("add-view-panel");
    await addViewPanel.getByRole("button", { name: "Gallery", exact: true }).click();
    await expect(block.getByTestId("gallery-new-page")).toBeVisible();

    // The New-page tile is a short bar, not a card-height ghost.
    const tileBox = await block.getByTestId("gallery-new-page").boundingBox();
    expect(tileBox.height).toBeLessThan(60);

    // Create a record from the toolbar (opens the record page peek).
    await block.hover();
    await block.locator(".odb-topbar-actions").getByRole("button", { name: "New", exact: true }).click();
    const peek = page.locator("aside").filter({ hasText: "osionos page" }).first();
    await peek.waitFor({ timeout: 10_000 });

    // Set a cover from the page header.
    await peek.getByRole("button", { name: /Add cover/ }).click();
    await page.getByTestId("cover-picker-item").first().click();
    await expect(peek.getByTestId("page-cover")).toBeVisible();
    await peek.getByRole("button", { name: "Close", exact: true }).click();

    // The gallery card now previews the cover (image or gradient) — target the
    // covered card specifically; the empty starter row's card has none.
    const coveredCard = block
      .locator('[data-testid="gallery-card-cover"]')
      .filter({ has: page.locator('img, [style*="gradient"]') });
    await expect(coveredCard).toHaveCount(1);

    // Reopen the record — the cover persisted.
    await coveredCard.click();
    await expect(peek.getByTestId("page-cover")).toBeVisible({ timeout: 10_000 });
  });

  test("the New chevron authors a template and instantiates records from it", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();

    // Author a template from the chevron dropdown.
    const chevron = block.locator('[aria-label="New from template"]');
    await chevron.click();
    await expect(page.getByText(/Templates for/)).toBeVisible();
    await page.getByRole("button", { name: "New template" }).click();
    const peek = page.locator("aside").filter({ hasText: "osionos page" }).first();
    await peek.waitFor({ timeout: 10_000 });
    await peek.getByRole("textbox", { name: "Page title" }).fill("Meeting template");
    await peek.getByRole("button", { name: "Close", exact: true }).click();

    // The template is hidden from the view body...
    await expect(block.getByText("Meeting template")).toHaveCount(0);

    // ...but listed in the dropdown; instantiating it opens a real record.
    // (Block-scoped: the record page also appears in the sidebar file tree,
    // so a page-scoped locator would click the tree entry instead.)
    await block.hover();
    await chevron.click();
    await block.getByRole("button", { name: /Meeting template/ }).first().click();
    await peek.waitFor({ timeout: 10_000 });
    await peek.getByRole("button", { name: "Close", exact: true }).click();

    // Exactly one "Meeting template" row: the instance, never the template.
    await expect(block.getByText("Meeting template")).toHaveCount(1);
  });

  test("the Open-pages-in setting drives how records open", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    const newBtn = block.locator(".odb-topbar-actions").getByRole("button", { name: "New", exact: true });

    // Default: side peek.
    await newBtn.click();
    await expect(page.locator("[data-open-in]").first()).toHaveAttribute("data-open-in", "side_peek");
    await page.locator("aside").getByRole("button", { name: "Close", exact: true }).click();

    // Settings → (Layout →) Open pages in → Center peek.
    await block.hover();
    await block.locator('[aria-label="View settings"]').click();
    const dialog = page.locator("dialog");
    if ((await dialog.getByText("Open pages in").count()) === 0) {
      await dialog.getByText("Layout", { exact: true }).first().click();
    }
    await dialog.getByText("Open pages in").first().click();
    await dialog.getByText("Center peek", { exact: true }).click();
    await page.locator('button[aria-label="Close"][tabindex="-1"]').click();

    // New records now open centered — and the page actually renders inside
    // (regression: .osionos-page is size-contained; an auto-height panel
    // collapsed it to zero, showing only the header).
    await block.hover();
    await newBtn.click();
    const centerPanel = page.locator('[data-open-in="center_peek"]');
    await expect(centerPanel).toBeVisible();
    await expect(centerPanel.getByRole("textbox", { name: "Page title" })).toBeVisible();
    await centerPanel.getByRole("button", { name: "Close", exact: true }).click();

    // Full page: full-screen surface whose breadcrumb navigates back
    // (regression: users got stuck — the overlay covers the app chrome).
    await block.hover();
    await block.locator('[aria-label="View settings"]').click();
    if ((await dialog.getByText("Open pages in").count()) === 0) {
      await dialog.getByText("Layout", { exact: true }).first().click();
    }
    await dialog.getByText("Open pages in").first().click();
    await dialog.getByText("Full page", { exact: true }).click();
    await page.locator('button[aria-label="Close"][tabindex="-1"]').click();

    await block.hover();
    await newBtn.click();
    const fullPanel = page.locator('[data-open-in="full_page"]');
    await expect(fullPanel).toBeVisible();
    await fullPanel.getByTitle("Back to database").click();
    await expect(page.locator("[data-open-in]")).toHaveCount(0);
  });

  test("+ opens the Select-type panel; picking a type creates the column and opens its panel", async ({ page }) => {
    const block = await insertInlineDatabase(page);

    // A fresh database ships one empty starter row, ready to type into
    // (count, not first-visible — the "New" row made that pass vacuously).
    await expect(block.locator("tbody tr")).toHaveCount(2); // starter + New

    // The + panel: "Select type" header + searchable sectioned type grid.
    // It floats LEFT of the table (over the page margin/sidebar) so it never
    // covers the columns being edited; clamps to the viewport when cramped.
    const addBtn = block.locator('[aria-label="Add property"]');
    const addBox = await addBtn.boundingBox();
    await addBtn.click();
    await expect(page.getByText("Select type")).toBeVisible();
    const tableBox = await block.locator("table").boundingBox();
    const panelBox = await page.getByTestId("add-property-panel").boundingBox();
    const expectedLeft = Math.max(8, tableBox.x - panelBox.width - 12);
    expect(Math.abs(panelBox.x - expectedLeft)).toBeLessThan(4); // ±borders
    expect(panelBox.y).toBeGreaterThanOrEqual(addBox.y + addBox.height);
    // Shrink-to-fit invariant: the panel's right edge never crosses the
    // table's left edge (it narrows down to its 280px floor first).
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(Math.max(tableBox.x + 2, 294));

    // Regression (narrow margin): the fixed-400px panel used to clamp to
    // x=8 and spill over the table's left columns on smaller windows.
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1000, height: 720 });
    await addBtn.click();
    const nTableBox = await block.locator("table").boundingBox();
    const nPanelBox = await page.getByTestId("add-property-panel").boundingBox();
    expect(nPanelBox.x + nPanelBox.width).toBeLessThanOrEqual(Math.max(nTableBox.x + 2, 294));
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 720 });
    await addBtn.click();
    await expect(page.getByText("Select type")).toBeVisible();
    await expect(page.getByRole("button", { name: "Multi-select" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Created time" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search types" }).fill("num");
    await expect(page.getByRole("button", { name: "Text", exact: true })).toHaveCount(0);

    // Picking a type creates the column named after it and opens its config
    // panel so it can be renamed immediately (Notion parity).
    await page.getByRole("button", { name: "Number", exact: true }).click();
    await expect(block.locator("thead").getByText("Number")).toBeVisible();
    await expect(page.locator('input[placeholder="Property name"]')).toHaveValue("Number");
  });

  test("property panel: one default column, rename (incl. Name), type change, duplicate, sort, hide", async ({ page }) => {
    const block = await insertInlineDatabase(page);

    // Notion parity: a fresh table ships ONLY the mandatory Name column
    // (thead = Name + add-property + column-options controls).
    // thead = drag gutter + Name + add-property + column-options.
    await expect(block.getByText("Tags", { exact: true })).toHaveCount(0);
    await expect(block.getByText("Status", { exact: true })).toHaveCount(0);
    await expect(block.locator("thead th")).toHaveCount(4);

    // The mandatory Name column is renamable from its panel — and the panel
    // opens right below the column header (portaled past the size-contained
    // page, which used to shift it far to the right).
    const nameHeader = block.locator("thead").getByRole("button", { name: "Name" });
    const headerBox = await nameHeader.boundingBox();
    await nameHeader.click();
    const nameInput = page.locator('input[placeholder="Property name"]');
    const inputBox = await nameInput.boundingBox();
    expect(Math.abs(inputBox.x - headerBox.x)).toBeLessThan(80);
    expect(inputBox.y).toBeGreaterThan(headerBox.y + headerBox.height);
    expect(inputBox.y - (headerBox.y + headerBox.height)).toBeLessThan(80);

    // Regression: the panel used to clamp top to innerHeight-400, yanking it
    // UP over the header on short viewports. The panel's TOP edge must stay
    // below the header bottom; lack of room caps height + scrolls instead.
    await page.getByRole("textbox", { name: "Page title" }).click(); // close panel
    await page.setViewportSize({ width: 1280, height: 500 });
    await nameHeader.click();
    const shortHeaderBox = await nameHeader.boundingBox();
    const panelBox = await page.getByTestId("property-config-panel").boundingBox();
    expect(panelBox.y).toBeGreaterThanOrEqual(shortHeaderBox.y + shortHeaderBox.height);
    await page.setViewportSize({ width: 1280, height: 720 });

    await nameInput.fill("Titre");
    await nameInput.press("Enter");
    await page.getByRole("textbox", { name: "Page title" }).click(); // close panel
    await expect(block.locator("thead").getByText("Titre")).toBeVisible();

    // Title panel: Show page icon toggle + Insert right.
    await block.locator("thead").getByRole("button", { name: "Titre" }).click();
    await expect(page.getByRole("switch", { name: "Show page icon" })).toBeVisible();
    await page.getByRole("button", { name: "Insert right" }).click();
    await expect(block.locator("thead th")).toHaveCount(5);

    // Change the new column's type — the panel reflects it live (svg/type row).
    await block.locator("thead").getByRole("button", { name: "New column" }).click();
    await page.getByRole("button", { name: /Type: Text/ }).click();
    await page.getByRole("button", { name: "Number", exact: true }).click();
    await expect(page.getByRole("button", { name: /Type: Number/ })).toBeVisible();

    // Duplicate copies the property (with values) right of the original.
    await page.getByRole("button", { name: "Duplicate property" }).click();
    await expect(block.locator("thead th")).toHaveCount(6);
    await expect(block.locator("thead").getByText("New column copy")).toBeVisible();

    // Sort ascending from the panel lights up the toolbar Sort counter.
    await block.locator("thead").getByRole("button", { name: "Titre" }).click();
    await page.getByRole("button", { name: "Sort ascending" }).click();
    await expect(block.locator('[aria-label="Sort"]').getByText("1")).toBeVisible();

    // Hide the duplicate from the view.
    await block.locator("thead").getByRole("button", { name: "New column copy" }).click();
    await page.getByRole("button", { name: "Hide in view" }).click();
    await expect(block.locator("thead th")).toHaveCount(5);
  });

  test("the title link opens the database origin as a full-page tab", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.locator('button[title="Open database"]').click();

    // The origin surface: full-page database tab with the full chrome
    // (editable h1 title + view tabs).
    const fullPage = page.locator(".osionos-database-block--full").first();
    await fullPage.waitFor({ timeout: 15_000 });
    await expect(fullPage.getByRole("heading", { name: "Untitled Database" })).toBeVisible();
    await expect(fullPage.locator('[aria-label="Add view"]')).toBeVisible();
  });

  test("add-view panel floats unclipped; board cards render text values", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    const titleBox = page.getByRole("textbox", { name: "Page title" });

    // Columns: a Select (so Board can auto-group) and a Text with a value.
    await expect(block.locator("tbody tr")).toHaveCount(2); // starter + New
    const addProp = block.locator('[aria-label="Add property"]');
    await addProp.click();
    await page.getByTestId("add-property-panel").getByRole("button", { name: "Select", exact: true }).click();
    await titleBox.click(); // close the auto-opened config panel
    await expect(block.locator("tbody tr")).toHaveCount(2);
    await addProp.click();
    await page.getByTestId("add-property-panel").getByRole("button", { name: "Text", exact: true }).click();
    await titleBox.click();
    await expect(block.locator("tbody tr")).toHaveCount(2);

    // Fill the starter row's Text cell (dblclick opens the inline editor).
    const textCell = block.locator("tbody tr").first().locator("td").nth(3);
    await textCell.dblclick();
    await textCell.locator("input, textarea").first().fill("hello board");
    await page.keyboard.press("Enter");

    // The add-view panel: portaled Notion grid, fully on-screen, all 10 tiles.
    await block.hover();
    await block.locator('[aria-label="Add view"]').click();
    const panel = page.getByTestId("add-view-panel");
    await expect(panel).toBeVisible();
    const pBox = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(pBox.x).toBeGreaterThanOrEqual(0);
    expect(pBox.x + pBox.width).toBeLessThanOrEqual(viewport.width);
    for (const label of ["Table", "Board", "Gallery", "List", "Chart", "Dashboard", "Timeline", "Feed", "Map", "Calendar"]) {
      await expect(panel.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    // Board: the card must SHOW the text value (used to render nothing).
    await panel.getByRole("button", { name: "Board", exact: true }).click();
    const card = block.getByTestId("board-card-props").first();
    await expect(card).toBeVisible();
    await expect(card.getByText("hello board")).toBeVisible();

    // Reorder within a column: drag the "hello board" card onto the bottom
    // half of the last card — it lands exactly there, not "somewhere".
    const col = block.locator('[role="group"]').first();
    await col.getByRole("button", { name: "New", exact: true }).click();
    await col.getByRole("button", { name: "New", exact: true }).click();
    const cards = col.locator("[data-board-card]");
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText("hello board");

    const lastCard = cards.nth(2);
    const lastBox = await lastCard.boundingBox();
    await cards.first().locator("button").dragTo(lastCard, {
      targetPosition: { x: Math.floor(lastBox.width / 2), y: Math.floor(lastBox.height - 4) },
    });
    await expect(cards.nth(2)).toContainText("hello board");
    await expect(cards.first()).not.toContainText("hello board");
  });

  test("files & media accepts any extension, multiple files, and offers downloads", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    const titleBox = page.getByRole("textbox", { name: "Page title" });

    await block.locator('[aria-label="Add property"]').click();
    await page.getByTestId("add-property-panel").getByRole("button", { name: "Files & media", exact: true }).click();
    await titleBox.click(); // close the auto-opened config panel

    // Open the cell editor and upload a markdown file AND a png together.
    const filesCell = block.locator("tbody tr").first().locator("td").nth(2);
    await filesCell.dblclick();
    const editor = page.locator("dialog[open]");
    await expect(editor).toBeVisible();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await editor.locator('input[type="file"]').setInputFiles([
      { name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("# hello\n") },
      { name: "pixel.png", mimeType: "image/png", buffer: png },
    ]);

    // Both attach: every extension is welcome, more than one per cell.
    await expect(editor.getByText("notes.md")).toBeVisible();
    await expect(editor.locator("img")).toHaveCount(1); // png thumbnail
    // Each attachment is downloadable through its preview.
    await editor.locator('[aria-label="Preview notes.md"]').click();
    await expect(page.locator('a[download="notes.md"]').first()).toBeVisible();
    await page.locator('button[aria-label="Close preview"]').last().click();

    // Close the editor (refocus inside first — the preview left focus on
    // body): the cell shows the attachments and they persist on reopen.
    await editor.getByRole("tab", { name: "Upload" }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(filesCell.getByText("notes.md")).toBeVisible();
    await filesCell.dblclick();
    await expect(page.locator("dialog[open]").getByText("notes.md")).toBeVisible();
  });

  test("dashboard Responsive layout toggle relayouts thin inline widgets", async ({ page }) => {
    const block = await insertInlineDatabase(page);

    // Create a Dashboard view from the + panel (fresh → auto-detect layout).
    await block.hover();
    await block.locator('[aria-label="Add view"]').click();
    await page.getByTestId("add-view-panel").getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(block.getByText("Total Records")).toBeVisible();

    // Viewport breakpoints lie in embeds: the stat grid renders 4 columns
    // even though the inline container is far narrower than the window.
    const statsGrid = block.locator("div.grid").first();
    const colCount = () => statsGrid.evaluate(
      el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(await colCount()).toBe(4);

    // Settings → Layout: the toggle sits right BEFORE Show page icon.
    await block.hover();
    await block.locator('[aria-label="View settings"]').click();
    const dialog = page.locator("dialog");
    if ((await dialog.getByText("Responsive layout").count()) === 0) {
      await dialog.getByText("Layout", { exact: true }).first().click();
    }
    const responsive = dialog.getByRole("menuitemcheckbox", { name: "Responsive layout" });
    const showIcon = dialog.getByRole("menuitemcheckbox", { name: "Show page icon" });
    await expect(responsive).toBeVisible();
    const [rBox, sBox] = [await responsive.boundingBox(), await showIcon.boundingBox()];
    expect(rBox.y).toBeLessThan(sBox.y);

    // Off by default (opt-in); switching it on relayouts by CONTAINER width:
    // the same grid drops below 4 columns inside the narrow embed.
    await expect(responsive).toHaveAttribute("aria-checked", "false");
    await responsive.click();
    await expect(responsive).toHaveAttribute("aria-checked", "true");
    await page.locator('button[aria-label="Close"][tabindex="-1"]').click();
    expect(await colCount()).toBeLessThan(4);
  });

  test("view-tab menu: select-then-open, right-click direct, per-view actions", async ({ page }) => {
    const block = await insertInlineDatabase(page);

    // Second view (Gallery) — becomes active, so Table is NOT selected.
    await block.hover();
    await block.locator('[aria-label="Add view"]').click();
    await page.getByTestId("add-view-panel").getByRole("button", { name: "Gallery", exact: true }).click();
    await expect(block.getByTestId("gallery-new-page")).toBeVisible();

    const tableTab = block.getByRole("button", { name: "Table", exact: true });
    const galleryTab = block.getByRole("button", { name: "Gallery", exact: true });
    const menu = page.getByTestId("view-tab-menu");

    // Rule: left-click on a NON-active tab only selects — no panel.
    await tableTab.click();
    await expect(block.locator("thead")).toBeVisible();
    await expect(menu).toHaveCount(0);

    // Rule: clicking the now-ACTIVE tab opens the full Notion panel.
    await tableTab.click();
    await expect(menu).toBeVisible();
    for (const label of ["Rename", "Display as", "Edit view", "Copy link to view", "Open source database", "Duplicate view", "Delete view"]) {
      await expect(menu.getByText(label)).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // Rule: RIGHT-click a non-active tab opens ITS panel directly, without
    // switching views — and the actions bind to THAT view (Rename edits
    // Gallery's tab, while Table stays the active view underneath).
    await galleryTab.click({ button: "right" });
    await expect(menu).toBeVisible();
    await expect(block.locator("thead")).toBeVisible(); // still on Table
    await menu.getByText("Rename").click();
    await expect(block.locator("input").first()).toHaveValue("Gallery");
    await page.keyboard.press("Escape");

    // Display as → Icon only: the tab keeps its icon and aria-label but
    // drops the text label (per-view setting).
    await tableTab.click(); // active → opens panel
    await menu.getByText("Display as").click();
    await menu.getByText("Icon only").click();
    await expect(menu.getByText("Only applies to you")).toBeVisible();
    await expect(tableTab.getByText("Table")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(tableTab).toBeVisible(); // still reachable by aria-label
  });

  test("grouping: Notion stacked sections with collapse, GitHub slice sidebar", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    const titleBox = page.getByRole("textbox", { name: "Page title" });

    // Text column + two rows with distinct values → two groups.
    await block.locator('[aria-label="Add property"]').click();
    await page.getByTestId("add-property-panel").getByRole("button", { name: "Text", exact: true }).click();
    await titleBox.click(); // close the auto-opened config panel
    const fillText = async (row, value) => {
      const cell = block.locator("tbody tr").nth(row).locator("td").nth(2);
      await cell.dblclick();
      await cell.locator("input, textarea").first().fill(value);
      await page.keyboard.press("Enter");
    };
    await fillText(0, "alpha");
    await block.getByRole("button", { name: "New", exact: true }).last().click();
    await fillText(1, "beta");

    // Gallery view, grouped by Text via Layout settings.
    await block.hover();
    await block.locator('[aria-label="Add view"]').click();
    await page.getByTestId("add-view-panel").getByRole("button", { name: "Gallery", exact: true }).click();
    await expect(block.getByTestId("gallery-new-page")).toBeVisible();
    await block.hover();
    await block.locator('[aria-label="View settings"]').click();
    const dialog = page.locator("dialog");
    if ((await dialog.getByText("Group by").count()) === 0) {
      await dialog.getByText("Layout", { exact: true }).first().click();
    }
    await dialog.getByText("Group by").first().click();
    await dialog.getByRole("button", { name: "Text", exact: true }).click();

    // Notion mode (default): stacked sections, one per value, collapsible.
    const sections = block.getByTestId("gallery-group-section");
    await expect(sections).toHaveCount(2);
    await expect(dialog.getByText("Group layout")).toBeVisible(); // new row appears
    await page.locator('button[aria-label="Close"][tabindex="-1"]').click();
    const alphaSection = sections.filter({ hasText: "alpha" }).first();
    await expect(alphaSection.locator("div.grid")).toHaveCount(1);
    await alphaSection.getByRole("button", { name: /Collapse group/ }).click();
    await expect(alphaSection.locator("div.grid")).toHaveCount(0); // minimized
    await alphaSection.getByRole("button", { name: /Expand group/ }).click();
    await expect(alphaSection.locator("div.grid")).toHaveCount(1);

    // GitHub mode: Group layout → Side panel; slice to "beta".
    await block.hover();
    await block.locator('[aria-label="View settings"]').click();
    if ((await dialog.getByText("Group layout").count()) === 0) {
      await dialog.getByText("Layout", { exact: true }).first().click();
    }
    await dialog.getByText("Group layout").first().click();
    await dialog.getByText("Side panel (slice)", { exact: true }).click();
    await page.locator('button[aria-label="Close"][tabindex="-1"]').click();

    const sidebar = block.getByTestId("group-slice-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("All")).toBeVisible();
    await expect(block.getByTestId("gallery-group-section")).toHaveCount(0); // flat body
    const cards = block.locator("div.grid > button:not([data-testid='gallery-new-page'])");
    await expect(cards).toHaveCount(2); // "All" slice
    await sidebar.getByRole("button", { name: /beta/ }).click();
    await expect(cards).toHaveCount(1); // sliced to beta
    await sidebar.getByRole("button", { name: /^All/ }).click();
    await expect(cards).toHaveCount(2);

    // Group is ALSO on the settings MAIN panel (Notion order) — and the hub's
    // Back returns to where it was opened from.
    await block.hover();
    await block.locator('[aria-label="View settings"]').click();
    const groupRow = dialog.getByText("Group", { exact: true }).first();
    await expect(groupRow).toBeVisible(); // main screen row
    await expect(dialog.getByText("Text", { exact: true }).first()).toBeVisible(); // shows current group
    await groupRow.click();
    await expect(dialog.getByText("Group layout")).toBeVisible(); // hub extras
    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(dialog.getByText("Property visibility")).toBeVisible(); // back to MAIN
  });
});

// #162: a file's properties read badly. Faint names, a faint "Add a property", a
// remove button only a mouse could find, people and attachments as raw text, and
// relations that read "Untitled" twice or pointed at no page at all.

import { expect, test } from "@playwright/test";

import { openFreshPage, waitForRenderStability } from "../../browser/core/app.mjs";

const properties = (page) => page.getByRole("group", { name: "Page properties" });

/** Another page of the workspace, to relate to. */
async function otherPage(page) {
  return page.evaluate(async () => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const { activePage, pages } = usePageStore.getState();
    const other = (pages[activePage.workspaceId] ?? []).find((entry) => entry._id !== activePage.id && entry.title && !entry.archivedAt);
    return { id: other._id, title: other.title };
  });
}

async function seed(page, list) {
  await page.evaluate(async (list) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    store.patchPage(store.activePage?.id, { properties: list });
  }, list);
  await waitForRenderStability(page);
}

const everyKind = (related) => [
  { key: "stage", label: "Stage", type: "select", value: "Doing", options: ["Todo", "Doing", "Done"] },
  { key: "tags", label: "Tags", type: "multi_select", value: ["alpha", "beta"], options: ["alpha", "beta", "gamma"] },
  { key: "due", label: "Due", type: "date", value: "2026-10-01" },
  { key: "notes", label: "Notes", type: "text", value: "" },
  { key: "done", label: "Done", type: "checkbox", value: true },
  { key: "owner", label: "Owner", type: "person", value: ["Ada Lovelace", "Alan Turing"], readOnly: true },
  { key: "files", label: "Files", type: "files", value: ["brief.pdf", "cover.png"], readOnly: true },
  { key: "related", label: "Related", type: "relation", value: [related.id, related.id, "page-that-no-longer-exists"] },
];

/** WCAG contrast of an element's text against the first painted background behind it. */
const contrastOf = (locator) => locator.evaluate((element) => {
  const rgb = (color) => (color.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]) => {
    const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  let node = element;
  let background = null;
  while (node && !background) {
    const color = rgb(getComputedStyle(node).backgroundColor);
    if (color.length === 3 || (color.length === 4 && color[3] === 1)) background = color;
    node = node.parentElement;
  }
  const [a, b] = [lum(rgb(getComputedStyle(element).color)), lum(background ?? [255, 255, 255])];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});

for (const mode of ["light", "dark"]) {
  test(`#162 every kind of property reads at 4.5:1 in the ${mode} theme`, async ({ page, baseURL }) => {
    await page.addInitScript((stored) => localStorage.setItem("osionos:theme-mode", stored), mode);
    await openFreshPage(page, baseURL);
    await seed(page, everyKind(await otherPage(page)));
    const panel = properties(page);
    await panel.screenshot({ path: test.info().outputPath(`properties-${mode}.png`), animations: "disabled" });

    for (const name of ["Stage", "Owner", "Related"]) {
      expect(await contrastOf(panel.getByText(name, { exact: true }).first()), `${name} label`).toBeGreaterThanOrEqual(4.5);
    }
    expect(await contrastOf(panel.getByRole("button", { name: "Add a property" })), "Add a property").toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(panel.getByText("Ada Lovelace")), "a person").toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(panel.getByText("Missing page")), "a missing page").toBeGreaterThanOrEqual(4.5);
  });
}

test("#162 a related page shows once by its title, and a page that is gone says so", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const related = await otherPage(page);
  await seed(page, everyKind(related));
  const row = properties(page).locator("[data-property-key='related']");
  await expect(row.locator(".osio-chip")).toHaveText([related.title, "Missing page"]);
  await expect(row.getByRole("button", { name: "Remove relation Missing page" })).toBeVisible();
});

test("#162 people and attachments are chips, one per value", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await seed(page, everyKind(await otherPage(page)));
  // The person's initial is an aria-hidden avatar, so the name is the chip's last span.
  const names = (key) => properties(page).locator(`[data-property-key='${key}'] .osio-chip > span:last-child`);
  await expect(names("owner")).toHaveText(["Ada Lovelace", "Alan Turing"]);
  await expect(names("files")).toHaveText(["brief.pdf", "cover.png"]);
});

test("#162 the remove button shows when the keyboard reaches it", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await seed(page, everyKind(await otherPage(page)));
  const remove = properties(page).locator("[data-property-key='notes']").getByRole("button", { name: "Remove property" });
  await remove.focus();
  await expect(remove).toHaveCSS("opacity", "1");
});

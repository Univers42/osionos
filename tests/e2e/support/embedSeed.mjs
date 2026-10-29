// Seeds private pages of blocks into the offline workspace and opens one, for specs that need
// block JSON the editor UI refuses to create.

import { explorerRow } from "../../browser/core/app.mjs";

// Seeded before any app code runs, once per tab: a reload fires `pagehide`, which flushes the
// app's own page cache over a key written after load, and a seed that re-ran on every reload
// would undo the edits a persistence test is checking.
export async function seedPages(page, pages) {
  await page.addInitScript((entries) => {
    if (sessionStorage.getItem("embed-seeded") !== null) return;
    sessionStorage.setItem("embed-seeded", "1");
    localStorage.setItem("osio:pages:mock-ws-private-0", JSON.stringify(entries.map((entry) => ({
      workspaceId: "mock-ws-private-0", ownerId: "mock-user-0", visibility: "private", collaborators: [],
      parentPageId: null, databaseId: null, archivedAt: null, ...entry,
    }))));
    localStorage.setItem("pg:recents", "[]");
  }, pages);
}

export async function seedPage(page, baseURL, blocks) {
  await seedPages(page, [{ _id: "embed-seed", title: "Embed seed", content: blocks }]);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Embed seed").click();
}

// A snapshot the bridge would have stored for a page it found frameable. Without one an offline
// generic embed is an "unknown" card, so specs that check the frame itself seed this.
export function frameableSnapshot(url) {
  return {
    url, kind: "link", provider: null, title: "", description: "", siteName: "",
    image: "", favicon: "", player: null, media: null, frameable: true,
    resolvedAt: "2026-10-19T12:00:00.000Z",
  };
}

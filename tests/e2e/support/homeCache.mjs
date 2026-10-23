/* ************************************************************************** */

/** The Home page's cached `updatedAt`: the seed stamps it with `new Date()`, so a
 *  re-seed moves it and a no-op reload leaves it alone. Content alone cannot tell
 *  (the merge is idempotent), so this is how "not re-seeded" is measured. */
export async function cachedHomeUpdatedAt(page) {
  return page.evaluate(() => {
    for (const [key, value] of Object.entries(localStorage)) {
      if (!key.startsWith("osio:pages:")) continue;
      let pages;
      try {
        pages = JSON.parse(value);
      } catch {
        continue;
      }
      if (!Array.isArray(pages)) continue;
      const home = pages.find((entry) => typeof entry?._id === "string" && entry._id.startsWith("home-dashboard:"));
      if (home) return home.updatedAt ?? null;
    }
    return null;
  });
}

/** The stamp once the user's own edits have stopped moving it. An edit touches
 *  `updatedAt` too, so reading it right after typing would blame the reload for
 *  the edit's own write. Caveat: "settled" is two equal reads 1.2s apart, so an
 *  edit write slower than that would still be blamed on the reload. */
export async function settledHomeUpdatedAt(page) {
  let previous = await cachedHomeUpdatedAt(page);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(1200);
    const current = await cachedHomeUpdatedAt(page);
    if (current === previous) return current;
    previous = current;
  }
  throw new Error("the Home page's updatedAt never settled");
}

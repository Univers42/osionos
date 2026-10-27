/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysViewsBridge.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A stub bridge for `sys:` sources with saved views: the rows, an in-memory view map
// per source the PUT/DELETE routes edit, and a record of every write so a spec can
// assert what left the app.

import { stubBridge } from "./bridgeStub.mjs";
import { seedPage } from "./embedSeed.mjs";

export const SOURCE = "my-pages";
const DEFAULT_SOURCES = [{
  source: SOURCE,
  columns: ["id", "title", "updated_at"],
  rows: [
    { id: "p1", title: "Alpha", updated_at: "2026-10-22T10:00:00.000Z" },
    { id: "p2", title: "Beta", updated_at: "2026-10-22T09:00:00.000Z" },
  ],
}];

/** Serves each `{ source, columns, rows }` and its saved views; `puts` and `deletes` list every write, by path. */
export async function stubSysViews(page, { saveStatus = 200, sources = DEFAULT_SOURCES } = {}) {
  // `failRows`, when set, is the answer every rows read gets until it is cleared.
  const bridge = { views: {}, puts: [], deletes: [], rowRequests: 0, failRows: null };
  for (const { source } of sources) bridge.views[source] = {};
  await stubBridge(page, (url, request) => {
    const rows = sources.find(({ source }) => url.pathname === `/api/account/self-data/${source}`);
    if (rows) {
      bridge.rowRequests += 1;
      if (bridge.failRows) return bridge.failRows;
      return { json: { ok: true, source: rows.source, columns: rows.columns, rows: rows.rows, truncated: false } };
    }
    const owner = sources.find(({ source }) => url.pathname.startsWith(`/api/account/self-data/views/${source}`));
    if (!owner) return undefined;
    const views = bridge.views[owner.source];
    const id = decodeURIComponent(url.pathname.slice(`/api/account/self-data/views/${owner.source}/`.length));
    if (request.method() === "PUT") {
      bridge.puts.push({ id, path: url.pathname, body: request.postDataJSON(), auth: request.headers().authorization });
      if (saveStatus !== 200) return { status: saveStatus, json: { error: "invalid_view" } };
      views[id] = request.postDataJSON();
    } else if (request.method() === "DELETE") {
      bridge.deletes.push(id);
      delete views[id];
    }
    return { json: { ok: true, source: owner.source, views } };
  });
  return bridge;
}

export async function openSysDatabase(page, baseURL) {
  await seedPage(page, baseURL, [{ id: "sys-views", type: "database_inline", content: "", databaseId: `sys:${SOURCE}`, viewId: `${SOURCE}-default` }]);
  const block = page.locator(`.osionos-database-block[data-database-id="sys:${SOURCE}"]`);
  await block.locator('[aria-label="Add view"]').waitFor({ timeout: 20_000 });
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
  return block;
}

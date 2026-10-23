/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysViewsBridge.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A stub bridge for one `sys:` source with saved views: the rows, an in-memory view map the
// PUT/DELETE routes edit, and a record of every write so a spec can assert what left the app.

import { stubBridge } from "./bridgeStub.mjs";
import { seedPage } from "./embedSeed.mjs";

export const SOURCE = "my-pages";
const VIEWS_PREFIX = `/api/account/self-data/views/${SOURCE}`;
const ROWS = [
  { id: "p1", title: "Alpha", updated_at: "2026-10-22T10:00:00.000Z" },
  { id: "p2", title: "Beta", updated_at: "2026-10-22T09:00:00.000Z" },
];

export async function stubSysViews(page, { saveStatus = 200 } = {}) {
  const bridge = { views: {}, puts: [], deletes: [], rowRequests: 0 };
  await stubBridge(page, (url, request) => {
    if (url.pathname === `/api/account/self-data/${SOURCE}`) {
      bridge.rowRequests += 1;
      return { json: { ok: true, source: SOURCE, columns: ["id", "title", "updated_at"], rows: ROWS, truncated: false } };
    }
    if (!url.pathname.startsWith(VIEWS_PREFIX)) return undefined;
    const id = decodeURIComponent(url.pathname.slice(VIEWS_PREFIX.length + 1));
    if (request.method() === "PUT") {
      bridge.puts.push({ id, body: request.postDataJSON(), auth: request.headers().authorization });
      if (saveStatus === 200) bridge.views[id] = request.postDataJSON();
      else return { status: saveStatus, json: { error: "invalid_view" } };
    } else if (request.method() === "DELETE") {
      bridge.deletes.push(id);
      delete bridge.views[id];
    }
    return { json: { ok: true, source: SOURCE, views: bridge.views } };
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

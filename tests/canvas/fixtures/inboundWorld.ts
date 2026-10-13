/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundWorld.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A real page-file facade over the in-memory fixture store, plus the inbound
// pending state on a manual clock — the world the inbound view and executor run
// against in node. The ledger and index cache are module-level: one fresh
// workspace id per world.

import type { Block } from "../../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../../src/entities/page/model/types.ts";
import { createInboundPending } from "../../../src/features/ide/model/inboundPending.ts";
import { createInboundView } from "../../../src/features/ide/model/inboundView.ts";
import { createPageFileFacade } from "../../../src/features/page-file/model/pageFileFacade.ts";
import { createReadableViews } from "../../../src/features/page-file/model/pageFileFacadeViews.ts";
import { createFixtureStore, page } from "../page-file-facade-fixtures.ts";
import { createFakeClock } from "./fakeClock.ts";

let worlds = 0;
export const freshWs = (): string => `ws-inbound-${(worlds += 1)}`;

export const para = (text: string): Block[] => [{ id: `b-${text}`, type: "paragraph", content: text }];
/** A block page (file `<title>.omd`); `parent` is the parent page id. */
export const blockPage = (id: string, title: string, parent: string | null = null, body = id): PageEntry =>
  page(id, title, parent, "page", para(body));
export const folderPage = (id: string, title: string, parent: string | null = null): PageEntry => page(id, title, parent, "folder");
export const codePage = (id: string, title: string, code: string, parent: string | null = null): PageEntry =>
  page(id, title, parent, "code", [{ id: `code-${id}`, type: "code", content: code, fileName: title }]);

export function viewWorld(pages: PageEntry[]) {
  const workspaceId = freshWs();
  const store = createFixtureStore(workspaceId);
  store._seed(pages.map((entry) => ({ ...entry, workspaceId })));
  const views = createReadableViews(store);
  const facade = createPageFileFacade(store, views);
  const clock = createFakeClock();
  const queued: (() => Promise<void>)[] = [];
  const pending = createInboundPending({ schedule: clock.schedule, enqueue: (task) => { queued.push(task); } });
  const view = createInboundView({ workspaceId, store, views, pending, readText: (id) => facade.readContent(id) });
  return { workspaceId, store, views, facade, clock, queued, pending, view };
}

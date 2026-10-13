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
import { sha16, type FsEvent } from "../../../src/features/ide/model/ideFsEcho.ts";
import { INBOUND_WINDOW_MS, createInboundPending } from "../../../src/features/ide/model/inboundPending.ts";
import { createSerialQueue } from "../../../src/features/ide/model/inboundPipeline.ts";
import { createInboundSession, type StatResult } from "../../../src/features/ide/model/inboundSession.ts";
import { createInboundView } from "../../../src/features/ide/model/inboundView.ts";
import { isFsError } from "../../../src/features/ide/vfs/errors.ts";
import { createMemProvider } from "../../../src/features/ide/vfs/memProvider.ts";
import { buildVPath } from "../../../src/features/ide/vfs/vpath.ts";
import { textToBytes } from "../../../src/features/ide/vfs/bytes.ts";
import type { FsProvider } from "../../../src/features/ide/vfs/types.ts";
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

/** base64 of the UTF-8 bytes, as the fs-agent sends file content. */
export const b64 = (text: string): string => btoa(Array.from(textToBytes(text), (byte) => String.fromCharCode(byte)).join(""));

/** The store's restore: the page and every descendant come back. O(n · depth). */
function restoreIn(store: ReturnType<typeof createFixtureStore>, pageId: string): void {
  const back = new Set([pageId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const entry of store.pages()) {
      if (entry.parentPageId && back.has(entry.parentPageId) && !back.has(entry._id)) { back.add(entry._id); grew = true; }
    }
  }
  store._seed(store.pages().map((entry) => (back.has(entry._id) ? { ...entry, archivedAt: null } : entry)));
}

async function statIn(provider: FsProvider, workspaceId: string, path: string): Promise<StatResult> {
  try {
    await provider.stat(buildVPath(provider.scheme, workspaceId, path.split("/")));
    return "present";
  } catch (error) {
    return isFsError(error) && error.code === "NotFound" ? "absent" : "unknown";
  }
}

/** Puts `text` at `path` in the sandbox, creating the parent directories. */
export async function putFile(sandbox: FsProvider, workspaceId: string, path: string, text: string): Promise<void> {
  const segments = path.split("/");
  for (let depth = 1; depth < segments.length; depth += 1) {
    await sandbox.mkdir(buildVPath(sandbox.scheme, workspaceId, segments.slice(0, depth))).catch(() => undefined);
  }
  await sandbox.write(buildVPath(sandbox.scheme, workspaceId, segments), textToBytes(text));
}

export type ExecWorldOptions = { files?: Record<string, string>; stat?: (path: string) => Promise<StatResult> };

/** The whole inbound path: a session on a real serial queue, a mem sandbox, a manual clock. */
export async function execWorld(pages: PageEntry[], opts: ExecWorldOptions = {}) {
  const workspaceId = freshWs();
  const store = createFixtureStore(workspaceId);
  store._seed(pages.map((entry) => ({ ...entry, workspaceId })));
  const sandbox = createMemProvider("sandbox");
  for (const [path, text] of Object.entries(opts.files ?? {})) await putFile(sandbox, workspaceId, path, text);
  const clock = createFakeClock();
  const queueErrors: unknown[] = [];
  const queue = createSerialQueue((error) => { queueErrors.push(error); });
  const session = createInboundSession({
    workspaceId, store, restore: async (id) => restoreIn(store, id), schedule: clock.schedule,
    stat: opts.stat ?? ((path) => statIn(sandbox, workspaceId, path)), enqueue: (task) => { void queue.run(task); },
  });
  const send = (evt: FsEvent): Promise<void> => queue.run(() => session.handle(evt));
  const shellWrite = async (path: string, text: string): Promise<void> => {
    await putFile(sandbox, workspaceId, path, text);
    await send({ event: "write", path, hash: await sha16(text), content: b64(text) });
  };
  const shellDelete = async (path: string): Promise<void> => {
    await sandbox.delete(buildVPath(sandbox.scheme, workspaceId, path.split("/")), { recursive: true }).catch(() => undefined);
    await send({ event: "delete", path });
  };
  const elapse = async (): Promise<void> => { clock.advance(INBOUND_WINDOW_MS); await queue.idle(); };
  const pageOf = (id: string): PageEntry | undefined => store.pages().find((entry) => entry._id === id);
  return { workspaceId, store, sandbox, clock, queue, queueErrors, session, send, shellWrite, shellDelete, elapse, pageOf };
}

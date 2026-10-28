// A page the edge refuses as too large must not stall the outbox, and a pasted picture must
// not make a page too large. Live, 2026-10-28: one page holding a 558 KB base64 image was
// refused at the edge, read as a transient failure, and every page queued behind it stayed
// unsaved in localStorage until the browser quota ran out.

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "@/entities/page";
import { publishOutboxPage, type FlushDeps } from "@/store/sync/pageFlush";
import { pageStamp } from "@/store/sync/pageStamp";
import type { PublishOutcome } from "@/store/sync/publishResult";
import { publishResultFor } from "@/store/sync/publishResult";
import { dataUrlToFile, inlineImagesIn, replaceInlineImages } from "@/shared/lib/media/inlineImages";
import { fakeRecovery, pageEntry, para } from "./page-version.fixtures";

type Notice = Parameters<FlushDeps["notify"]>[0];

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

function outcome(result: PublishOutcome["result"]): PublishOutcome {
  return { result, ignored: [], version: null, conflict: null };
}

function depsFor(results: PublishOutcome["result"][], overrides: Partial<FlushDeps> = {}) {
  const notices: Notice[] = [];
  const published: PageEntry[] = [];
  const deps: FlushDeps = {
    publish: async (page) => { published.push(page); return outcome(results.shift() ?? "ok"); },
    recovery: fakeRecovery("failed", null).deps,
    privateWorkspaceId: () => "private",
    notify: (notice) => { notices.push(notice); },
    applyContent: () => null,
    recordVersion: () => undefined,
    ...overrides,
  };
  return { deps, notices, published };
}

function job(page: PageEntry) {
  return { page, id: page._id, stamp: pageStamp(page), confirmed: {} as Record<string, string>, forgotten: new Set<string>(), budget: { left: 5 } };
}

test("publishResultFor: 413 is rejected, not a transient failure", () => {
  const table: Array<[number, string]> = [[413, "rejected"], [403, "refused"], [404, "gone"], [500, "failed"], [502, "failed"], [429, "failed"]];
  for (const [status, want] of table) assert.equal(publishResultFor(status), want, `status ${status}`);
});

test("a rejected page lets the batch go on, stays unconfirmed, and is reported once per session", async () => {
  const page = pageEntry("too-big", [para("b1", "x")], { title: "Portfolio" });
  const { deps, notices } = depsFor(["rejected", "rejected"]);
  const first = job(page);
  assert.equal(await publishOutboxPage(first, deps), "continue");
  assert.deepEqual(first.confirmed, {});
  assert.equal(first.forgotten.size, 0);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].sticky, true);
  assert.match(notices[0].title, /Portfolio/);
  assert.equal(await publishOutboxPage(job(page), deps), "continue");
  assert.equal(notices.length, 1, "the same page is not reported again");
});

test("a transient failure still stops the batch", async () => {
  const { deps } = depsFor(["failed"]);
  assert.equal(await publishOutboxPage(job(pageEntry("p", [para("b1", "x")])), deps), "stop");
});

test("externalize: the rewritten page is what gets published, and its own stamp is confirmed", async () => {
  const page = pageEntry("pic", [{ id: "i1", type: "image", content: PNG } as never]);
  const rewritten = pageEntry("pic", [{ id: "i1", type: "image", content: "https://bridge/api/media/uploads/o/a.png" } as never], { updatedAt: "later" });
  const { deps, published } = depsFor(["ok"], { externalize: async () => rewritten });
  const flushed = job(page);
  assert.equal(await publishOutboxPage(flushed, deps), "continue");
  assert.equal(published[0], rewritten);
  assert.equal(flushed.confirmed["pic"], pageStamp(rewritten));
});

test("inlineImagesIn finds each distinct data-URL image, anywhere in the value, once", () => {
  const value = { cover: GIF, content: [{ content: PNG }, { children: [{ props: { src: PNG } }] }], text: "data:text/plain;base64,aGk=" };
  assert.deepEqual(inlineImagesIn(value).sort(), [GIF, PNG].sort());
  assert.deepEqual(inlineImagesIn({ content: [para("b1", "no pictures")] }), []);
});

test("replaceInlineImages swaps mapped images only, and returns the same value when nothing maps", () => {
  const value = { cover: GIF, content: [{ content: PNG }, { content: `![a](${PNG})` }] };
  const replaced = replaceInlineImages(value, new Map([[PNG, "https://bridge/m/a.png"]]));
  assert.deepEqual(replaced, { cover: GIF, content: [{ content: "https://bridge/m/a.png" }, { content: "![a](https://bridge/m/a.png)" }] });
  assert.equal(replaceInlineImages(value, new Map()), value);
  assert.equal(replaceInlineImages(value, new Map([["data:image/png;base64,QQ==", "u"]])), value);
});

test("dataUrlToFile decodes the bytes and keeps the type", async () => {
  const file = dataUrlToFile(GIF, "pasted");
  assert.equal(file.type, "image/gif");
  assert.equal(file.name, "pasted.gif");
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 6)], [...new TextEncoder().encode("GIF89a")]);
});

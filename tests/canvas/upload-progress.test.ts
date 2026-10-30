/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   upload-progress.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #177: an upload showed nothing while its bytes went out. fetch has no upload
// progress, so the shared transport is XMLHttpRequest; this drives it with a fake.

import assert from "node:assert/strict";
import test from "node:test";

import { postWithProgress } from "../../src/shared/lib/media/postWithProgress.ts";

type Listener = ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;

class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  responseText = "";
  upload: { onprogress: Listener } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeXhr.last = this; }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send(body: unknown) { this.body = body; }
  sent(loaded: number, total: number, lengthComputable = true) { this.upload.onprogress?.({ lengthComputable, loaded, total }); }
  answer(status: number, text: string) { this.status = status; this.responseText = text; this.onload?.(); }
}

(globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;

const file = new Blob(["0123456789"], { type: "image/png" });

test("POSTs the file with the given headers and reports the sent fraction until the answer", async () => {
  const fractions: number[] = [];
  const pending = postWithProgress("https://bridge.test/api/chat/uploads?name=a.png", file, { Authorization: "Bearer t" }, (f) => fractions.push(f));
  const xhr = FakeXhr.last;
  assert.equal(xhr.method, "POST");
  assert.equal(xhr.url, "https://bridge.test/api/chat/uploads?name=a.png");
  assert.deepEqual(xhr.headers, { Authorization: "Bearer t" });
  assert.equal(xhr.body, file);
  xhr.sent(3, 10);
  xhr.sent(10, 10);
  xhr.answer(201, '{"ok":true}');
  assert.deepEqual(await pending, { status: 201, text: '{"ok":true}' });
  assert.deepEqual(fractions, [0.3, 1]);
});

test("a progress event without a known length reports nothing", async () => {
  const fractions: number[] = [];
  const pending = postWithProgress("https://bridge.test/u", file, {}, (f) => fractions.push(f));
  FakeXhr.last.sent(5, 0, false);
  FakeXhr.last.answer(200, "{}");
  await pending;
  assert.deepEqual(fractions, []);
});

test("an error answer resolves with its status, so the caller reads the bridge's message", async () => {
  const pending = postWithProgress("https://bridge.test/u", file, {});
  FakeXhr.last.answer(413, '{"message":"Upload exceeds the 50MB limit."}');
  assert.deepEqual(await pending, { status: 413, text: '{"message":"Upload exceeds the 50MB limit."}' });
});

test("a request that never completes rejects", async () => {
  const pending = postWithProgress("https://bridge.test/u", file, {});
  FakeXhr.last.onerror?.();
  await assert.rejects(pending, /did not complete/);
});

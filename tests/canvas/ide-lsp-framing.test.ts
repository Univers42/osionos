/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-lsp-framing.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { frameLsp, createLspFramer } from "../../src/features/ide/model/lspFraming.ts";
import { pathForPage } from "../../src/features/ide/model/idePaths.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

function collect(chunks: Uint8Array[]): string[] {
  const framer = createLspFramer();
  const out: string[] = [];
  for (const c of chunks) framer.feed(c, (m) => out.push(m));
  return out;
}

test("frameLsp round-trips a single message", () => {
  const msg = JSON.stringify({ jsonrpc: "2.0", method: "hi", params: { a: 1 } });
  assert.deepEqual(collect([frameLsp(msg)]), [msg]);
});

test("Content-Length counts UTF-8 bytes, not chars", () => {
  const msg = JSON.stringify({ text: "café — 日本語 😀" });
  const framed = frameLsp(msg);
  const header = new TextDecoder().decode(framed.subarray(0, 40));
  assert.match(header, /Content-Length: (\d+)\r\n\r\n/);
  const declared = Number(/Content-Length: (\d+)/.exec(header)![1]);
  assert.equal(declared, new TextEncoder().encode(msg).length);
  assert.deepEqual(collect([framed]), [msg]);
});

test("deframes a message split across chunks", () => {
  const msg = JSON.stringify({ method: "split" });
  const framed = frameLsp(msg);
  const cut = 8; // mid-header
  assert.deepEqual(collect([framed.subarray(0, cut), framed.subarray(cut)]), [msg]);
});

test("deframes two coalesced messages in one chunk", () => {
  const a = JSON.stringify({ n: 1 });
  const b = JSON.stringify({ n: 2 });
  const merged = new Uint8Array([...frameLsp(a), ...frameLsp(b)]);
  assert.deepEqual(collect([merged]), [a, b]);
});

test("holds a partial body until the rest arrives", () => {
  const msg = JSON.stringify({ big: "x".repeat(50) });
  const framed = frameLsp(msg);
  const framer = createLspFramer();
  const out: string[] = [];
  framer.feed(framed.subarray(0, framed.length - 10), (m) => out.push(m));
  assert.deepEqual(out, []); // body incomplete
  framer.feed(framed.subarray(framed.length - 10), (m) => out.push(m));
  assert.deepEqual(out, [msg]);
});

test("pathForPage walks folder ancestors with sanitized segments", () => {
  const pages: PageEntry[] = [
    { _id: "root", workspaceId: "w", title: "src", surface: "folder" },
    { _id: "sub", workspaceId: "w", title: "fea/tures", surface: "folder", parentPageId: "root" },
    { _id: "file", workspaceId: "w", title: "main.ts", surface: "code", parentPageId: "sub" },
  ];
  const byId = (id: string) => pages.find((p) => p._id === id);
  assert.equal(pathForPage("file", byId), "src/fea tures/main.ts"); // "/" sanitized to space
  assert.equal(pathForPage("root", byId), "src");
});

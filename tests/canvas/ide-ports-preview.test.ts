/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-ports-preview.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createPortPreview } from "../../src/features/ide/model/idePorts.ts";
import { createIdeTransport } from "../../src/features/ide/api/ideTransport.ts";
import { IDE, WS, fakeEnv, type Call } from "./ide-token-fixtures.ts";

function previewWith(sessionBody: unknown, ideBase = IDE) {
  const env = fakeEnv({
    ideBase,
    handler: (call: Call) => {
      if (call.url.endsWith("/api/ide/token")) {
        return new Response(JSON.stringify({ ok: true, token: "osionos_ide1.t", expiresAt: new Date(Date.now() + 9e5).toISOString() }), { status: 200 });
      }
      return new Response(JSON.stringify(sessionBody), { status: 200 });
    },
  });
  const transport = createIdeTransport(env.source, { fetch: env.deps.fetch, ideBase: () => ideBase });
  const opened: Array<[string, string, string]> = [];
  const open = (url: string, target: string, features: string): void => void opened.push([url, target, features]);
  return { env, opened, preview: createPortPreview({ ideFetch: transport.ideFetch, ideBase: () => ideBase, open }) };
}

test("preview posts to the IDE origin and opens the returned url with noopener,noreferrer", async () => {
  const { env, opened, preview } = previewWith({ ok: true, url: "https://ide.example/p/abc/" });
  assert.equal(await preview(WS, 3000), true);
  const call = env.calls.find((c) => c.url.endsWith("/api/ide/preview/session"));
  assert.equal(call?.url, `${IDE}/api/ide/preview/session`);
  assert.deepEqual(JSON.parse(String(call?.init.body)), { workspaceId: WS, port: 3000 });
  assert.deepEqual(opened, [["https://ide.example/p/abc/", "_blank", "noopener,noreferrer"]]);
});

test("a url on a foreign origin, a relative url or a non-http scheme is refused", async () => {
  for (const url of ["https://evil.example/p/", "/p/abc/", "javascript:alert(1)", "ftp://ide.example/x", "https://ide.example.evil.example/", 42, undefined]) {
    const { opened, preview } = previewWith({ ok: true, url });
    assert.equal(await preview(WS, 3000), false, String(url));
    assert.deepEqual(opened, [], String(url));
  }
});

test("an unconfigured IDE opens nothing", async () => {
  const { opened, preview } = previewWith({ ok: true, url: "https://ide.example/p/" }, "");
  assert.equal(await preview(WS, 3000), false);
  assert.deepEqual(opened, []);
});

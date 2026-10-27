/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-web-access.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



/**
 * The web switch and the composer toggle: hidden on a 404, per-message and
 * never sticky, and the PUT carries `acknowledged:true` only after a confirm.
 * No DOM here: the pure view and the model are the proof.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { setAiTransport } from "../../src/features/ai/api/aiClient";
import { buildRunContext } from "@/features/ai/model/aiContext";
import { loadWebView, saveWebAccess, WEB_DISCLOSURE } from "@/features/ai/model/webSettings";
import { useWebToggle } from "@/features/ai/model/webToggle";
import { WebToggleView } from "@/widgets/chat-shell/ui/WebToggle";
import { WebAccessRowView } from "@/features/settings/ai/WebAccessRow";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("a 404 on the settings means no web UI", async () => {
  setAiTransport(async () => json(404, { error: "not_found" }));
  assert.deepEqual(await loadWebView("ws"), { status: "off" });
  assert.equal(renderToStaticMarkup(React.createElement(WebAccessRowView, {
    view: { status: "off" }, asking: null, busy: false, error: "", onToggle() {}, onConfirm() {}, onCancel() {},
  })), "");
});

test("the settings answer is read from the server", async () => {
  setAiTransport(async () => json(200, { enabled: true }));
  assert.deepEqual(await loadWebView("ws"), { status: "ready", enabled: true });
});

test("the toggle is per message: on for one send, off for the next", () => {
  useWebToggle.getState().set(true);
  assert.equal(useWebToggle.getState().take(), true);
  assert.equal(useWebToggle.getState().take(), false);
  assert.equal(buildRunContext([], true).web, true);
  assert.equal("web" in buildRunContext([], false), false);
});

test("the pressed toggle shows the disclosure, the idle one does not", () => {
  const draw = (pressed: boolean) =>
    renderToStaticMarkup(React.createElement(WebToggleView, { pressed, onPress() {} }));
  assert.doesNotMatch(draw(false), /third-party/);
  assert.match(draw(false), /aria-pressed="false"/);
  const out = draw(true);
  assert.match(out, /aria-pressed="true"/);
  assert.ok(out.includes(WEB_DISCLOSURE));
});

test("the PUT carries acknowledged:true exactly, and 403s are plain words", async () => {
  const bodies: string[] = [];
  setAiTransport(async (_input, init) => {
    bodies.push(String(init?.body));
    return json(200, { enabled: true });
  });
  assert.deepEqual(await saveWebAccess("ws", true), { ok: true, enabled: true });
  assert.deepEqual(JSON.parse(bodies[0]!), { enabled: true, acknowledged: true });

  setAiTransport(async () => json(403, { error: "reauth_required" }));
  const reauth = await saveWebAccess("ws", true);
  assert.ok(!reauth.ok && /sign in again/i.test(reauth.words));
  setAiTransport(async () => json(403, { error: "forbidden" }));
  const denied = await saveWebAccess("ws", true);
  assert.ok(!denied.ok && /owner or admin/.test(denied.words));
});

test("the confirm step exists only once the reader asked, and shows the disclosure", () => {
  const render = (asking: boolean | null) =>
    renderToStaticMarkup(React.createElement(WebAccessRowView, {
      view: { status: "ready", enabled: false }, asking, busy: false, error: "", onToggle() {}, onConfirm() {}, onCancel() {},
    }));
  assert.doesNotMatch(render(null), /web-access-confirm/);
  const asked = render(true);
  assert.match(asked, /web-access-confirm/);
  assert.ok(asked.includes(WEB_DISCLOSURE));
});

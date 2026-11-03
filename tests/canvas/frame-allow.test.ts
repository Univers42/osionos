/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   frame-allow.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/03 17:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/03 17:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An iframe's `allow` keeps only the names the browser recognises, so no browser prints a warning
// per frame (Firefox's console on the beta, 2026-11-03). The engines themselves were measured with
// Playwright (src/shared/lib/dom/frameAllow.ts); these are the rules.

import assert from "node:assert/strict";
import test from "node:test";

import { frameAllow } from "../../src/shared/lib/dom/frameAllow.ts";

const NODE_FRAME = "local-network-access; clipboard-read; clipboard-write";
const PROVIDER = "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share";

function inBrowser<T>(globals: { document: object; window?: object }, run: () => T): T {
  const names = ["document", "window"] as const;
  const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach((name) => Object.defineProperty(globalThis, name, { value: globals[name], configurable: true }));
  try {
    return run();
  } finally {
    names.forEach((name, i) => {
      const descriptor = saved[i];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
}

const chromium = { document: { featurePolicy: { features: () => ["clipboard-read", "clipboard-write", "fullscreen"] } }, window: {} };
const firefox = { document: {}, window: { mozInnerScreenX: 0 } };
const webkit = { document: {}, window: {} };

test("server rendering keeps the whole list", () => {
  assert.equal(frameAllow(NODE_FRAME), NODE_FRAME);
});

test("Chromium keeps exactly the names its featurePolicy lists", () => {
  assert.equal(inBrowser(chromium, () => frameAllow(NODE_FRAME)), "clipboard-read; clipboard-write");
  assert.equal(inBrowser(chromium, () => frameAllow("fullscreen 'self'; usb")), "fullscreen 'self'");
});

test("Firefox gets none of the names it rejects, and no empty allow attribute", () => {
  assert.equal(inBrowser(firefox, () => frameAllow(NODE_FRAME)), undefined);
  assert.equal(inBrowser(firefox, () => frameAllow(PROVIDER)), "fullscreen; web-share");
});

test("WebKit, which warns about nothing, keeps the whole list", () => {
  assert.equal(inBrowser(webkit, () => frameAllow(PROVIDER)), PROVIDER);
});

test("empty directives and stray separators are dropped", () => {
  assert.equal(inBrowser(firefox, () => frameAllow(" fullscreen ;; ;web-share; ")), "fullscreen; web-share");
});

test("the node's frames keep fullscreen in every engine (its fullscreen button was denied in Firefox)", async () => {
  const { NODE_FRAME_PERMISSIONS } = await import("../../src/features/machines/model/machineWindow.ts");
  assert.equal(inBrowser(firefox, () => frameAllow(NODE_FRAME_PERMISSIONS)), "fullscreen");
  assert.equal(inBrowser(chromium, () => frameAllow(NODE_FRAME_PERMISSIONS)), "clipboard-read; clipboard-write; fullscreen");
  assert.equal(inBrowser(webkit, () => frameAllow(NODE_FRAME_PERMISSIONS)), NODE_FRAME_PERMISSIONS);
});


/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   preload-recovery.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// R-BR5: the stale-chunk reload (src/app/preloadRecovery.ts) fires once per 10 s for a failed lazy
// import, and never while the document is already being navigated away. RED until the module exists:
// the handler is inline in src/app/main.tsx today and has no seam to test.

import assert from "node:assert/strict";
import test from "node:test";

import { installPreloadRecovery } from "../../src/app/preloadRecovery.ts";

function harness(startAt = 1_000_000) {
  const target = new EventTarget();
  const values = new Map<string, string>();
  let clock = startAt;
  let reloads = 0;
  installPreloadRecovery(target, {
    storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) },
    now: () => clock,
    reload: () => void (reloads += 1),
  });
  return {
    fail: () => target.dispatchEvent(new Event("vite:preloadError")),
    leave: () => target.dispatchEvent(new Event("beforeunload")),
    advance: (ms: number) => void (clock += ms),
    reloads: () => reloads,
  };
}

test("a failed lazy import reloads once", () => {
  const page = harness();
  page.fail();
  assert.equal(page.reloads(), 1);
});

test("a failure after the document started navigating away does not reload", () => {
  const page = harness();
  page.leave();
  page.fail();
  assert.equal(page.reloads(), 0);
});

test("a burst of failures inside the guard window reloads once", () => {
  const page = harness();
  page.fail();
  page.advance(9_999);
  page.fail();
  assert.equal(page.reloads(), 1);
});

test("a failure after the guard window may reload again", () => {
  const page = harness();
  page.fail();
  page.advance(10_001);
  page.fail();
  assert.equal(page.reloads(), 2);
});

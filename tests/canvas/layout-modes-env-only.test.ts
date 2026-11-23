/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-modes-env-only.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// RD5 (groot ADR 0067 D′): a production build decides osio.layout.modes from its env
// alone; dev and test builds keep the URL and localStorage overrides the e2e specs use.
// MODE, not PROD: the e2e production harness builds `vite build --mode test`.

import assert from "node:assert/strict";
import test from "node:test";

import { bakeBuildEnv, setLayoutModesOverride } from "./support/layout-modes-flag.ts";

bakeBuildEnv({});

async function build(env: Record<string, string>): Promise<() => boolean> {
  const flags = await import(`../../src/shared/config/featureFlags.ts?env=${encodeURIComponent(JSON.stringify(env))}`);
  return flags.isLayoutModesEnabled as () => boolean;
}

test("a production build with the env unset ignores the URL and localStorage override", async () => {
  setLayoutModesOverride("1");
  assert.equal((await build({ MODE: "production" }))(), false);
});

test("a production build with VITE_OSIO_LAYOUT_MODES=1 is on", async () => {
  setLayoutModesOverride(null);
  assert.equal((await build({ MODE: "production", VITE_OSIO_LAYOUT_MODES: "1" }))(), true);
});

test("a production build with the env on cannot be turned off by an override either", async () => {
  setLayoutModesOverride("0");
  assert.equal((await build({ MODE: "production", VITE_OSIO_LAYOUT_MODES: "1" }))(), true);
});

test("a test-mode build (the e2e harness, PROD true) honours the override", async () => {
  setLayoutModesOverride("1");
  assert.equal((await build({ MODE: "test", PROD: "true" }))(), true);
});

test("a test-mode build without any override stays off", async () => {
  setLayoutModesOverride(null);
  assert.equal((await build({ MODE: "test" }))(), false);
});

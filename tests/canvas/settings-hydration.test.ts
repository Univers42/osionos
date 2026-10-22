/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-hydration.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The state machine behind useSettingsHydration: a settings panel says
// "loading", then "ready" or "couldn't load", and an answer that arrives too
// late never overwrites a newer one. The machine is pure, so it is pinned here
// rather than through a rendered panel.

import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_HYDRATION_STATE,
  nextHydrationState,
  type SettingsHydrationEvent,
} from "@/features/settings/model/settingsHydration";

function load(generation: number): SettingsHydrationEvent {
  return { type: "load", generation };
}

function settle(generation: number, error: string | null = null): SettingsHydrationEvent {
  return { type: "settle", generation, error };
}

test("a panel starts loading and a clean answer ends ready", () => {
  assert.equal(INITIAL_HYDRATION_STATE.status, "loading");
  const loading = nextHydrationState(INITIAL_HYDRATION_STATE, load(1));
  assert.equal(loading.status, "loading");
  assert.equal(loading.error, null);
  const ready = nextHydrationState(loading, settle(1));
  assert.equal(ready.status, "ready");
  assert.equal(ready.error, null);
  assert.equal(ready.generation, 1);
});

test("a failed load says why, and a retry that succeeds comes back ready", () => {
  const loading = nextHydrationState(INITIAL_HYDRATION_STATE, load(1));
  const failed = nextHydrationState(loading, settle(1, "The server said no."));
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "The server said no.");

  const retried = nextHydrationState(failed, load(2));
  assert.equal(retried.status, "loading");
  assert.equal(retried.error, null);
  assert.equal(retried.generation, 2);

  const ready = nextHydrationState(retried, settle(2));
  assert.equal(ready.status, "ready");
  assert.equal(ready.error, null);
});

test("an answer from an older load is ignored", () => {
  const first = nextHydrationState(INITIAL_HYDRATION_STATE, load(1));
  const second = nextHydrationState(first, load(2));
  const stale = nextHydrationState(second, settle(1, "the first load"));
  assert.equal(stale.status, "loading");
  assert.equal(stale.error, null);
  assert.equal(stale.generation, 2);
});

test("an answer that arrives after the panel went away is ignored", () => {
  const loading = nextHydrationState(INITIAL_HYDRATION_STATE, load(1));
  const gone = nextHydrationState(loading, { type: "unmount" });
  const late = nextHydrationState(gone, settle(1, "too late"));
  assert.equal(late, gone);
  assert.equal(late.status, "loading");
  assert.equal(late.error, null);
});

test("a load after the panel went away starts over", () => {
  const loading = nextHydrationState(INITIAL_HYDRATION_STATE, load(1));
  const gone = nextHydrationState(loading, { type: "unmount" });
  const again = nextHydrationState(gone, load(2));
  assert.equal(again.status, "loading");
  assert.equal(again.unmounted, false);
  assert.equal(again.generation, 2);
});

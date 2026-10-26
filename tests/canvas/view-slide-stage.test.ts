/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   view-slide-stage.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// The slide stage must always end on the view the tab bar asked for last,
// however fast the user switches tabs.

import assert from "node:assert/strict";
import test from "node:test";

import { retargetSlide, slideOffset, stageStyle, type SlideState } from "../../src/shared/notion-database-sys/src/components/ViewSlideStage.tsx";

const idle = (viewId: string): SlideState =>
  ({ slots: [viewId, ""], keys: [0, 0], active: 0, incoming: null, dir: 1, run: false, lockH: 0 });
let seq = 0;
const key = () => ++seq;
const shown = (s: SlideState) => s.slots[s.incoming ?? s.active];

test("back to the outgoing view mid-slide cancels the slide", () => {
  const sliding = { ...retargetSlide(idle("A"), "B", 1, false, key, 400), run: true };
  assert.equal(shown(sliding), "B");
  const back = retargetSlide(sliding, "A", -1, false, key, 400);
  assert.equal(back.incoming, null);
  assert.equal(shown(back), "A");
  assert.equal(slideOffset(back.active, back), 0, "A rests on screen");
});

test("retarget to a third view mid-slide replaces the incoming pane", () => {
  const sliding = retargetSlide(idle("A"), "B", 1, false, key, 0);
  const third = retargetSlide(sliding, "C", 1, false, key, 0);
  assert.equal(shown(third), "C");
  assert.equal(third.slots[third.active], "A");
  assert.notEqual(third.keys[third.incoming ?? 0], sliding.keys[sliding.incoming ?? 0], "C mounts fresh");
});

test("same target is a no-op; reduced motion swaps in place", () => {
  const a = idle("A");
  assert.equal(retargetSlide(a, "A", 1, false, key, 0), a);
  const sliding = retargetSlide(a, "B", 1, false, key, 0);
  assert.equal(retargetSlide(sliding, "B", 1, false, key, 0), sliding);
  const instant = retargetSlide(a, "B", 1, true, key, 0);
  assert.equal(instant.incoming, null);
  assert.equal(shown(instant), "B");
});

test("any click sequence ends on the last clicked view", () => {
  const views = ["A", "B", "C"];
  let rng = 7;
  for (let run = 0; run < 500; run++) {
    let s = idle("A");
    let last = "A";
    for (let step = 0; step < 8; step++) {
      rng = (rng * 1103515245 + 12345) % 2147483648;
      last = views[rng % 3];
      s = retargetSlide(s, last, 1, rng % 5 === 0, key, 0);
      if (rng % 4 === 0 && s.incoming !== null) s = { ...s, active: s.incoming, incoming: null }; // slide committed
    }
    assert.equal(shown(s), last);
  }
});

test("an inline (flow) stage animates its height to the incoming pane's", () => {
  const armed = retargetSlide(idle("A"), "B", 1, false, key, 400);
  assert.equal(stageStyle(idle("A"), true, 0), undefined, "idle sizes normally");
  assert.deepEqual(stageStyle(armed, true, 0), { height: 400, flex: "none" }, "pinned before the run");
  const running = { ...armed, run: true };
  assert.equal(stageStyle(running, true, 250)?.height, 250);
  assert.match(String(stageStyle(running, true, 250)?.transition), /^height /);
  assert.deepEqual(stageStyle(running, false, 250), { height: 400, flex: "none" }, "full page keeps the pin");
});

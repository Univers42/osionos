/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-route.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The socket → queue seam of useIdeFsSync: which tab applies, what reaches the
// session, and that nothing runs before the queue gets to it.

import assert from "node:assert/strict";
import test from "node:test";

import { routeFsEvent } from "../../src/features/ide/model/inboundSession.ts";
import { blockPage, execWorld } from "./fixtures/inboundWorld.ts";

import type { FsEvent } from "../../src/features/ide/model/ideFsEcho.ts";

test("wiring: a follower tab applies nothing; the leader queues ready to attach and a delete to the session", async () => {
  const world = await execWorld([blockPage("R", "Roadmap")]);
  let leader = false;
  const attached: string[] = [];
  const route = (evt: FsEvent): void => routeFsEvent(evt, {
    isLeader: () => leader, queue: world.queue, session: world.session,
    attach: async () => { attached.push("attach"); },
  });
  route({ event: "ready", path: "" });
  route({ event: "delete", path: "Roadmap.omd" });
  await world.queue.idle();
  assert.deepEqual(attached, []);
  assert.equal(world.clock.pendingCount(), 0, "a follower must not arm a delete window");

  leader = true;
  route({ event: "ready", path: "" });
  route({ event: "delete", path: "Roadmap.omd" });
  assert.deepEqual(attached, [], "routing only queues; the attach runs when the queue reaches it");
  await world.queue.idle();
  assert.deepEqual(attached, ["attach"]);
  assert.equal(world.clock.pendingCount(), 1, "the leader's delete armed exactly one window");
});

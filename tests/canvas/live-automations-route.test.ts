/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-automations-route.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 23:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 23:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// O2: the bridge has no /query/v1 passthrough, so live automation rules must go through
// the gated /api/databases/:dbId/automations route (tests/bridge/bridge-mount-automations).
// With no bridge configured the client throws before fetching, carrying the path it chose.

import assert from "node:assert/strict";
import test from "node:test";

import {
  getLiveAutomations,
  putLiveAutomations,
} from "../../src/shared/notion-database-sys/src/store/live/liveAutomationsClient.ts";

const DB = "d0d0d0d0-1111-4111-8111-d0d0d0d0d0d0";

test("live automation rules are read and replaced through the bridge's database route", async () => {
  for (const call of [() => getLiveAutomations(DB), () => putLiveAutomations(DB, [])]) {
    await assert.rejects(call(), (error: { path?: string; code?: string }) => {
      assert.equal(error.code, "NOT_CONFIGURED");
      assert.equal(error.path, `/api/databases/${DB}/automations`);
      return true;
    });
  }
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   platform-role-agreement.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-4-b: the app and the bridge each carry the platform role vocabulary, because the app
// cannot import from scripts/**. This pins the two copies together so a role added on one
// side cannot silently be unknown on the other.

import assert from "node:assert/strict";
import test from "node:test";

import { PLATFORM_ROLES, ROLE_RANK, roleAtLeast } from "../../src/features/auth/model/platformRole.ts";
// @ts-expect-error — bridge modules are plain JS (Node built-ins only), no types.
import * as bridge from "../../scripts/bridge-roles.mjs";

test("the app and the bridge name the same roles in the same order", () => {
  assert.deepEqual([...PLATFORM_ROLES], [...bridge.PLATFORM_ROLES]);
});

test("the app and the bridge rank the roles the same way", () => {
  assert.deepEqual({ ...ROLE_RANK }, { ...bridge.ROLE_RANK });
});

test("roleAtLeast answers alike on every pair, including an unknown or missing role", () => {
  const roles = [...PLATFORM_ROLES, "wizard", null, undefined];
  for (const role of roles) {
    for (const min of PLATFORM_ROLES) {
      assert.equal(roleAtLeast(role as never, min), bridge.roleAtLeast(role, min), `${String(role)} >= ${min}`);
    }
  }
});

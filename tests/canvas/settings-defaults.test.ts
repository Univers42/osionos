/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-defaults.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The settings stores must not invent data: a user with no bridge sees nothing
// connected, and the default plan is the free one. The previous defaults handed
// every user a connected osionos Mail + Calendar and an "Education Plus" plan.

import assert from "node:assert/strict";
import test from "node:test";

import { defaultBillingState, defaultConnections } from "@/store/settings/defaults";

test("defaultConnections returns no invented connections", () => {
  assert.deepEqual(defaultConnections("user-1", "user@example.com"), []);
  assert.deepEqual(defaultConnections("user-2"), []);
});

test("defaultBillingState is the free plan with no payment details or invoice", () => {
  const state = defaultBillingState("workspace-1");
  assert.equal(state.plan, "Free");
  assert.equal(state.paymentMethod, null);
  assert.equal(state.billedTo, null);
  assert.equal(state.billingEmail, null);
  assert.equal(state.vatNumber, null);
  assert.equal(state.upcomingInvoice, null);
  assert.equal(state.workspaceId, "workspace-1");
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-sandbox-binding.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { sandboxBound, type BindingInputs } from "../../src/features/ide/model/sandboxBinding.ts";
import type { SandboxHealthState } from "../../src/features/ide/model/sandboxHealthStore.ts";

const ALL_STATES: SandboxHealthState[] = ["unknown", "online", "stopped", "disabled", "unavailable"];
const OFFLINE_STATES: SandboxHealthState[] = ["unknown", "stopped", "disabled", "unavailable"];

function inputs(overrides: Partial<BindingInputs>): BindingInputs {
  return { healthState: "online", healthWorkspaceId: "ws-1", ...overrides };
}

test("online + this workspace binds", () => {
  assert.equal(sandboxBound("ws-1", inputs({ healthWorkspaceId: "ws-1" })), true);
});

test("online + another workspace (or no verdict) does not bind", () => {
  assert.equal(sandboxBound("ws-1", inputs({ healthWorkspaceId: "ws-other" })), false);
  assert.equal(sandboxBound("ws-1", inputs({ healthWorkspaceId: null })), false);
});

test("every non-online state does not bind", () => {
  for (const healthState of OFFLINE_STATES) {
    assert.equal(sandboxBound("ws-1", inputs({ healthState })), false);
  }
});

test("empty workspaceId never binds", () => {
  assert.equal(sandboxBound("", inputs({ healthWorkspaceId: "" })), false);
});

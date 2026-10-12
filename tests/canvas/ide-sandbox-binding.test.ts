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
  return { workbench: false, ideMode: false, healthState: "online", healthWorkspaceId: "ws-1", ...overrides };
}

test("flag OFF follows ideMode regardless of health", () => {
  for (const ideMode of [true, false]) {
    for (const healthState of ALL_STATES) {
      for (const healthWorkspaceId of ["ws-1", "ws-other", null]) {
        assert.equal(sandboxBound("ws-1", inputs({ ideMode, healthState, healthWorkspaceId })), ideMode);
      }
    }
  }
});

test("flag ON + online + this workspace binds even when ideMode is false", () => {
  assert.equal(sandboxBound("ws-1", inputs({ workbench: true, ideMode: false })), true);
});

test("flag ON + online + another workspace (or no verdict) does not bind", () => {
  assert.equal(sandboxBound("ws-1", inputs({ workbench: true, healthWorkspaceId: "ws-other" })), false);
  assert.equal(sandboxBound("ws-1", inputs({ workbench: true, healthWorkspaceId: null })), false);
});

test("flag ON + every non-online state does not bind", () => {
  for (const healthState of OFFLINE_STATES) {
    assert.equal(sandboxBound("ws-1", inputs({ workbench: true, healthState })), false);
  }
});

test("empty workspaceId never binds in either mode", () => {
  assert.equal(sandboxBound("", inputs({ ideMode: true })), false);
  assert.equal(sandboxBound("", inputs({ workbench: true, ideMode: true, healthWorkspaceId: "" })), false);
});

test("flag ON ignores ideMode=true whenever the sandbox is not online", () => {
  for (const healthState of OFFLINE_STATES) {
    assert.equal(sandboxBound("ws-1", inputs({ workbench: true, ideMode: true, healthState })), false);
  }
});

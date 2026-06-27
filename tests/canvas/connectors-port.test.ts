/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectors-port.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { canTransition, assertTransition } from "@/features/connectors/model/connectorMachine";
import type { ConnectorTransport, ValidateResult } from "@/features/connectors/model/connectorPort";
import { createAnthropicConnector, ANTHROPIC_MODELS } from "@/features/connectors/adapters/anthropicConnector";

const transportReturning = (result: ValidateResult): ConnectorTransport => ({
  validate: async () => result,
});

test("state machine: legal edges only", () => {
  assert.ok(canTransition("disconnected", "connecting"));
  assert.ok(canTransition("connecting", "connected"));
  assert.ok(canTransition("connecting", "error"));
  assert.ok(canTransition("connected", "disconnected"));
  assert.ok(canTransition("error", "connecting"));
  assert.ok(!canTransition("disconnected", "connected")); // must go through connecting
  assert.throws(() => assertTransition("disconnected", "connected"), /invalid connector transition/);
});

test("env-token connect (valid): disconnected → connecting → connected, models appear", async () => {
  const c = createAnthropicConnector(transportReturning({ ok: true }));
  assert.equal(c.status(), "disconnected");
  assert.deepEqual(c.listModels(), []); // hidden until connected

  const result = await c.connect();
  assert.equal(result.state, "connected");
  assert.equal(c.status(), "connected");
  assert.equal(c.listModels().length, ANTHROPIC_MODELS.length);
  assert.equal(result.credentialRef?.handle, "env:ANTHROPIC_API_KEY");
});

test("env-token connect (invalid key): error with token-free message", async () => {
  const c = createAnthropicConnector(transportReturning({ ok: false, code: "invalid_credential", message: "Anthropic rejected the API key." }));
  const result = await c.connect();
  assert.equal(result.state, "error");
  assert.equal(result.error?.code, "invalid_credential");
  assert.equal(c.listModels().length, 0);
  assert.equal(result.credentialRef, undefined);
  // No secret-shaped value leaks into the error/snapshot.
  assert.ok(!/sk-|api[_-]?key|x-api-key/i.test(JSON.stringify(result)));
});

test("env-token connect (unreachable): error code unreachable", async () => {
  const c = createAnthropicConnector(transportReturning({ ok: false, code: "unreachable", message: "Could not reach Anthropic." }));
  const result = await c.connect();
  assert.equal(result.state, "error");
  assert.equal(result.error?.code, "unreachable");
});

test("disconnect: returns to disconnected and drops models", async () => {
  const c = createAnthropicConnector(transportReturning({ ok: true }));
  await c.connect();
  assert.equal(c.status(), "connected");
  await c.disconnect();
  assert.equal(c.status(), "disconnected");
  assert.deepEqual(c.listModels(), []);
});

test("validate() is a no-op while disconnected", async () => {
  let calls = 0;
  const c = createAnthropicConnector({ validate: async () => { calls += 1; return { ok: true }; } });
  const result = await c.validate();
  assert.equal(result.state, "disconnected");
  assert.equal(calls, 0); // no probe before connect
});

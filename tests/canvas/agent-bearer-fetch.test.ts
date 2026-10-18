/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bf.test.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// R1a review: with the agent route enabled, openSseStream sent no Authorization and an admin got 401.

import assert from "node:assert/strict";
import test from "node:test";

import { bearerFetch } from "../../src/shared/agent/bearerFetch.ts";

const record = () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => { calls.push([input, init]); return new Response("ok"); };
  return { calls, fetchImpl };
};

test("the session jwt is added as a bearer and the caller's headers are kept", async () => {
  const { calls, fetchImpl } = record();
  await bearerFetch(fetchImpl, () => "jwt-1")("http://b/api/agent/chat", { method: "POST", headers: { Accept: "text/event-stream" }, body: "{}" });
  const init = calls[0][1];
  const headers = new Headers(init?.headers);
  assert.equal(headers.get("authorization"), "Bearer jwt-1");
  assert.equal(headers.get("accept"), "text/event-stream");
  assert.equal(init?.method, "POST");
  assert.equal(init?.body, "{}");
});

test("without a session the request goes out untouched", async () => {
  const { calls, fetchImpl } = record();
  const init = { method: "POST", headers: { Accept: "text/event-stream" } };
  await bearerFetch(fetchImpl, () => null)("http://b/x", init);
  assert.equal(calls[0][1], init);
});

test("the jwt is read at call time, so a refreshed session is used", async () => {
  const { calls, fetchImpl } = record();
  let jwt = "old";
  const send = bearerFetch(fetchImpl, () => jwt);
  await send("http://b/x");
  jwt = "new";
  await send("http://b/x");
  assert.deepEqual(calls.map(([, init]) => new Headers(init?.headers).get("authorization")), ["Bearer old", "Bearer new"]);
});

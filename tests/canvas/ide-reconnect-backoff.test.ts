/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-reconnect-backoff.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createReconnectBackoff } from "../../src/features/ide/model/reconnectBackoff.ts";

// The bridge completes the WebSocket handshake BEFORE it learns the sandbox is stopped,
// then closes with 4004. Resetting the backoff on "open" therefore reset it on every
// refused attempt: measured, the IDE re-dialled /api/ide/fsync once a second, forever.

test("sockets that are refused without delivering data keep backing off", () => {
  const backoff = createReconnectBackoff();
  const delays = [1, 2, 3, 4].map(() => backoff.next());
  assert.deepEqual(delays, [1000, 4000, 15000, 15000]);
});

test("a socket that delivered data starts the ladder over", () => {
  const backoff = createReconnectBackoff();
  backoff.next();
  backoff.next();
  backoff.delivered();
  assert.equal(backoff.next(), 1000);
});

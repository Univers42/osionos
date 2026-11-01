/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machines-shape.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bridge hands the app an `ideOrigin` per machine and the app opens a window on it; the app
// re-checks it with the bridge's own rule (devil verdict 2026-10-31, condition 6) so a bridge bug
// or a tampered answer cannot point the window at another site. The parity test runs both rules.

import assert from "node:assert/strict";
import test from "node:test";

import { isLoopbackIdeOrigin as bridgeRule } from "../../scripts/ide-machine-protocol.mjs";
import { isLoopbackIdeOrigin, isMachineId } from "../../src/features/machines/model/machineShape.ts";

const ACCEPTED = ["http://127.0.0.1:4100", "http://127.0.0.1:1024", "http://127.255.255.254:65535", "http://127.1.2.3:4100"];
const REFUSED = [
  "https://127.0.0.1:4100", "http://127.0.0.1", "http://127.0.0.1:80", "http://127.0.0.1:1023", "http://127.0.0.1:65536",
  "http://127.0.0.1:4100/", "http://127.0.0.1:4100/x", "http://user@127.0.0.1:4100", "http://localhost:4100",
  "http://10.0.0.1:4100", "http://192.168.1.2:4100", "http://127.0.0.256:4100", "http://[::1]:4100", "http://127.0.0.1:4100?x=1",
  "http://127.0.0.1:4100#x", "javascript:alert(1)", "", "http://0x7f.0.0.1:4100", "http://127.1:4100", " http://127.0.0.1:4100",
];

test("a loopback http origin on an unprivileged port is accepted", () => {
  for (const origin of ACCEPTED) assert.equal(isLoopbackIdeOrigin(origin), true, origin);
});

test("anything else is refused: https, a path, userinfo, a name, another network, a bad octet or port", () => {
  for (const origin of REFUSED) assert.equal(isLoopbackIdeOrigin(origin), false, origin);
  for (const value of [null, undefined, 4100, {}, ["http://127.0.0.1:4100"]]) assert.equal(isLoopbackIdeOrigin(value), false, String(value));
});

test("the app's rule answers exactly what the bridge's rule answers", () => {
  for (const origin of [...ACCEPTED, ...REFUSED]) assert.equal(isLoopbackIdeOrigin(origin), bridgeRule(origin), origin);
});

test("a machine id is the bridge's random m- id, never a free name like laptop", () => {
  assert.equal(isMachineId("m-abcdefghijklmnop"), true);
  assert.equal(isMachineId("m-a2b3c4d5e6f7g7h7"), true);
  for (const id of ["laptop", "m-abc", "m-ABCDEFGHIJKLMNOP", "m-abcdefghijklmno1", "m-abcdefghijklmnopq", "", null]) {
    assert.equal(isMachineId(id), false, String(id));
  }
});

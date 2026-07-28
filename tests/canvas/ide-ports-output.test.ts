/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-ports-output.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import { parsePortsOutput } from "../../src/features/ide/model/idePorts.ts";
import { useIdeOutputBus } from "../../src/features/ide/model/ideOutputBus.ts";

test("parsePortsOutput reads ss -tln rows (v4 + v6), dedupes, sorts", () => {
  const output = [
    "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port",
    "LISTEN 0      128    0.0.0.0:8090        0.0.0.0:*",
    "LISTEN 0      511    [::]:4000           [::]:*",
    "LISTEN 0      128    127.0.0.1:8090      0.0.0.0:*", // dupe port → first wins
  ].join("\n");
  assert.deepEqual(parsePortsOutput(output), [
    { port: 4000, address: "[::]" },
    { port: 8090, address: "0.0.0.0" },
  ]);
});

test("parsePortsOutput reads netstat -tln rows and ignores noise", () => {
  const output = [
    "Active Internet connections (only servers)",
    "Proto Recv-Q Send-Q Local Address           Foreign Address         State",
    "tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN",
    "VFSERR:UNSUP",
  ].join("\n");
  assert.deepEqual(parsePortsOutput(output), [{ port: 3000, address: "0.0.0.0" }]);
  assert.deepEqual(parsePortsOutput("VFSERR:UNSUP"), []);
});

test("output bus appends with channel, caps history, clears", () => {
  const bus = useIdeOutputBus.getState();
  bus.clear();
  bus.append("terminal", "session closed: process ended");
  bus.append("fs-sync", "disconnected — reconnecting in 1s");
  const lines = useIdeOutputBus.getState().lines;
  assert.equal(lines.length, 2);
  assert.equal(lines[0].channel, "terminal");
  assert.match(lines[1].text, /reconnecting/);
  useIdeOutputBus.getState().clear();
  assert.equal(useIdeOutputBus.getState().lines.length, 0);
});

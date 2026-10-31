/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machines-api.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Machines client keeps only what the contract names and never trusts a field it did not
// check: a row with a bad id is dropped, an origin the loopback rule refuses reads as offline,
// and a claim missing a field is refused as a whole (docs/ide/vscode-backend/own-machines-plan.md).

import assert from "node:assert/strict";
import test from "node:test";

import { machineErrorMessage, machinesBridgeUrl, parseClaim, parseMachineList, parseToken } from "../../src/features/machines/api/machinesApi.ts";

const ROW = {
  id: "m-abcdefghijklmnop", name: "laptop", platform: "linux", fingerprint: "ABCD-EFGH-IJKL-MNOP",
  isDefault: true, online: true, ideOrigin: "http://127.0.0.1:4100", lastSeenAt: "2026-10-31T10:00:00.000Z",
};

test("the list keeps the contract fields of every well-formed row", () => {
  assert.deepEqual(parseMachineList({ machines: [ROW] }), [ROW]);
});

test("the pair command names the origin the bridge reports, never a page's guess", () => {
  parseMachineList({ machines: [], bridgeOrigin: "https://bridge.example:10000" });
  assert.equal(machinesBridgeUrl(), "https://bridge.example:10000");
  parseMachineList({ machines: [], bridgeOrigin: "javascript:alert(1)" });
  assert.equal(machinesBridgeUrl(), "https://bridge.example:10000", "a value that is not an https origin is ignored");
});

test("a row with a bad id is dropped, a missing list is empty", () => {
  assert.deepEqual(parseMachineList({ machines: [{ ...ROW, id: "laptop" }, null, "x"] }), []);
  assert.deepEqual(parseMachineList(null), []);
  assert.deepEqual(parseMachineList({ machines: "x" }), []);
});

test("an origin the loopback rule refuses makes the row offline with no origin", () => {
  for (const ideOrigin of ["https://evil.example", "http://127.0.0.1:4100/x", "http://10.0.0.1:4100", 7]) {
    const [row] = parseMachineList({ machines: [{ ...ROW, ideOrigin }] });
    assert.equal(row.online, false, String(ideOrigin));
    assert.equal(row.ideOrigin, null, String(ideOrigin));
  }
  const [offline] = parseMachineList({ machines: [{ ...ROW, online: false, ideOrigin: null }] });
  assert.equal(offline.online, false);
});

test("a claim needs every field; the IPs are kept for the warning", () => {
  const claim = { pairId: "p-1", name: "laptop", platform: "linux", fingerprint: "ABCD-EFGH", startIp: "203.0.113.0", yourIp: "198.51.100.0" };
  assert.deepEqual(parseClaim(claim), claim);
  assert.equal(parseClaim({ ...claim, fingerprint: undefined }), null);
  assert.equal(parseClaim({ ...claim, pairId: "" }), null);
  assert.equal(parseClaim(null), null);
});

test("a minted token must be an osionos_mc1 token with an expiry", () => {
  const token = "osionos_mc1.abcdefgh.eyJ4IjoxfQ.c2ln";
  assert.deepEqual(parseToken({ token, exp: 1_900_000_000 }), { token, exp: 1_900_000_000 });
  assert.equal(parseToken({ token: "osionos_ide1.x.y", exp: 1 }), null);
  assert.equal(parseToken({ token }), null);
});

test("every contract error code has its own sentence; an unknown one keeps the bridge's words", () => {
  for (const code of ["not_found", "machine_cap", "offline", "identity_mismatch", "not_allowed", "identity_required", "rate_limited", "sudo_required", "machines_unavailable"]) {
    assert.notEqual(machineErrorMessage(code, "raw"), "raw", code);
  }
  assert.equal(machineErrorMessage("other", "The bridge said no."), "The bridge said no.");
  assert.equal(machineErrorMessage(undefined, " "), "That did not go through. Try again.");
});

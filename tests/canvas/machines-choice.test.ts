/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machines-choice.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Which machine one click opens, what the pairing screen tells the person, and what the Terminal
// action does (own-machines plan §6, devil verdict 2026-10-31 condition 4). The hosted sandbox is
// never a fallback: with no online machine the answer is "none", and the view says how to start one.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import type { Machine } from "../../src/features/machines/api/machinesApi.ts";
import {
  chooseMachine, localNodeHint, normalizePairCode, connectCommand, pairWarning, readMachineRoute, shellWord,
} from "../../src/features/machines/model/machineChoice.ts";

const machine = (id: string, online: boolean, isDefault = false): Machine => ({
  id, name: id.slice(2, 6), platform: "linux", fingerprint: "ABCD", isDefault, online,
  ideOrigin: online ? "http://127.0.0.1:4100" : null, lastSeenAt: null,
});
const A = machine("m-aaaaaaaaaaaaaaaa", true);
const B = machine("m-bbbbbbbbbbbbbbbb", true, true);
const C = machine("m-cccccccccccccccc", false, true);

test("no node: the default machine when it is online", () => {
  assert.deepEqual(chooseMachine([A, B], null), { kind: "open", machine: B });
});

// At most one default per account (the partial unique index), so C is the only default here.
test("no node and the default is offline: the first online machine", () => {
  const later = machine("m-dddddddddddddddd", true);
  assert.deepEqual(chooseMachine([C, A, later], null), { kind: "open", machine: A });
});

test("no online machine is none-online; no machine at all is none; never a sandbox", () => {
  assert.deepEqual(chooseMachine([C], null), { kind: "none-online" });
  assert.deepEqual(chooseMachine([], null), { kind: "none" });
});

test("a named machine opens that one, says offline when it is, and not-found when it is not mine", () => {
  assert.deepEqual(chooseMachine([A, B], A.id), { kind: "open", machine: A });
  assert.deepEqual(chooseMachine([A, C], C.id), { kind: "offline", machine: C });
  assert.deepEqual(chooseMachine([A], "m-zzzzzzzzzzzzzzzz"), { kind: "not-found" });
});

test("the warning is shown when the code was started from another network, word for word", () => {
  assert.equal(
    pairWarning({ startIp: "203.0.113.0", yourIp: "198.51.100.0" }),
    "This code was started from another network (203.0.113.0). Approve only if you started it yourself on that machine.",
  );
  assert.equal(pairWarning({ startIp: "198.51.100.0", yourIp: "198.51.100.0" }), null);
});

test("the pairing code is read the way the bridge reads it: letters only, upper case, eight of the alphabet", () => {
  assert.equal(normalizePairCode("bcdf-ghjk"), "BCDF-GHJK");
  assert.equal(normalizePairCode(" BCDF GHJK "), "BCDF-GHJK");
  for (const code of ["BCDF-GHJ", "BCDF-GHJKL", "ABCD-EFGH", "", "1234-5678"]) assert.equal(normalizePairCode(code), null, code);
});

test("the commands name this bridge and this app, and quote a name the shell would split", () => {
  assert.match(connectCommand("https://baas.example:10000", "https://a", "laptop"), / --name laptop$/);
  assert.match(connectCommand("https://b.example", "https://a", "my laptop"), / --name 'my laptop'$/);
  assert.equal(shellWord("it's"), "'it'\\''s'");
  assert.equal(shellWord(""), "''");
});

test("the one command installs, pairs and serves, and pastes as it is", () => {
  const command = connectCommand("https://baas.example:10000", "https://app.example");
  assert.match(command, /^curl -fsSL https:\/\/\S+\/install\.sh \| sh -s -- --bridge https:\/\/baas\.example:10000 --app-origin https:\/\/app\.example$/);
  assert.doesNotMatch(command, /[<>]/);
});

// For a node installed before local=1, whose page reads only `node`: the id it should name.
test("the node hint is the machine /machine would open, else the default, else the only one", () => {
  assert.equal(localNodeHint([A, B]), B.id);
  assert.equal(localNodeHint([A]), A.id);
  assert.equal(localNodeHint([machine("m-cccccccccccccccc", false)]), "m-cccccccccccccccc");
  assert.equal(localNodeHint([A, machine("m-cccccccccccccccc", false, true)]), A.id);
  assert.equal(localNodeHint([machine("m-cccccccccccccccc", false), machine("m-dddddddddddddddd", false, true)]), "m-dddddddddddddddd");
  assert.equal(localNodeHint([machine("m-cccccccccccccccc", false), machine("m-dddddddddddddddd", false)]), null);
  assert.equal(localNodeHint([]), null);
  assert.equal(localNodeHint(null), null);
});

// For a node installed before local=1, whose page reads only `node`: the id it should name.
test("the node hint is the machine /machine would open, else the default, else the only one", () => {
  assert.equal(localNodeHint([A, B]), B.id);
  assert.equal(localNodeHint([A]), A.id);
  assert.equal(localNodeHint([machine("m-cccccccccccccccc", false)]), "m-cccccccccccccccc");
  assert.equal(localNodeHint([A, machine("m-cccccccccccccccc", false, true)]), A.id);
  assert.equal(localNodeHint([machine("m-cccccccccccccccc", false), machine("m-dddddddddddddddd", false, true)]), "m-dddddddddddddddd");
  assert.equal(localNodeHint([machine("m-cccccccccccccccc", false), machine("m-dddddddddddddddd", false)]), null);
  assert.equal(localNodeHint([]), null);
  assert.equal(localNodeHint(null), null);
});

test("/machine with no node chooses; a machine id opens it with or without a folder; a free name is the legacy path", () => {
  assert.deepEqual(readMachineRoute(""), { kind: "choose" });
  assert.deepEqual(readMachineRoute("?node=m-aaaaaaaaaaaaaaaa"), { kind: "machine", id: "m-aaaaaaaaaaaaaaaa", folder: null });
  assert.deepEqual(readMachineRoute("?node=m-aaaaaaaaaaaaaaaa&folder=%2Fsrv"), { kind: "machine", id: "m-aaaaaaaaaaaaaaaa", folder: "/srv" });
  assert.deepEqual(readMachineRoute("?node=laptop&folder=%2Fhome%2Fme"), { kind: "legacy", node: "laptop", folder: "/home/me" });
  for (const search of ["?node=laptop", "?node=Laptop&folder=/x", "?node=m-aaaaaaaaaaaaaaaa&folder=rel", "?node=a&node=b"]) {
    assert.equal(readMachineRoute(search), null, search);
  }
});

test("R5: the command from production or the beta remembers that origin; any other app's remembers nothing", () => {
  for (const origin of ["https://baas.tail10f2ea.ts.net:8443", "https://baas-beta.tail10f2ea.ts.net"]) {
    assert.match(connectCommand("https://baas.tail10f2ea.ts.net:10000", origin, "laptop"), new RegExp(` --app-origin ${origin} --remember-origin ${origin} --name laptop$`));
  }
  assert.doesNotMatch(connectCommand("https://baas.example:10000", "https://app.example"), /--remember-origin/);
});

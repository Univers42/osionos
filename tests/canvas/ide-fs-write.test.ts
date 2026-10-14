/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-fs-write.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The editor's save had its own request, without the fs transport's 429 retry:
// a paste saved while the bridge throttled never reached the sandbox and said
// nothing (live VM, 2026-10-14).

import assert from "node:assert/strict";
import test from "node:test";

import { ideFsWrite } from "../../src/features/ide/model/ideFsClient.ts";
import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { useIdeOutputBus } from "../../src/features/ide/model/ideOutputBus.ts";
import { syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { base64ToBytes } from "../../src/features/ide/vfs/sandboxFsOps.ts";
import { bytesToText } from "../../src/features/ide/vfs/bytes.ts";
import { fsError } from "../../src/features/ide/vfs/errors.ts";
import type { FsOpTransport } from "../../src/features/ide/vfs/sandboxFsOps.ts";

test("ideFsWrite: a write op with base64 content; success records the agreed hash", async () => {
  const sent: { op: string; path: string; text: string }[] = [];
  const transport: FsOpTransport = async (op, params) => {
    sent.push({ op, path: params.path, text: bytesToText(base64ToBytes(params.contentBase64 ?? "")) });
    return { exitCode: 0, output: "" };
  };
  assert.equal(await ideFsWrite("ws-write-1", "gnl/get_next_line.c", "int é;\n", transport), true);
  assert.deepEqual(sent, [{ op: "write", path: "gnl/get_next_line.c", text: "int é;\n" }]);
  assert.equal(syncedHashOf("ws-write-1", "gnl/get_next_line.c"), await sha16("int é;\n"));
});

test("ideFsWrite: a failed save rolls the ledger back and says so in Output", async () => {
  for (const [name, transport] of [
    ["exit", (async () => ({ exitCode: 1, output: "VFSERR:EIO" })) as FsOpTransport],
    ["throw", (async () => { throw fsError("Io", undefined, "bridge 429"); }) as FsOpTransport],
  ] as const) {
    const ws = `ws-write-fail-${name}`;
    assert.equal(await ideFsWrite(ws, "main.c", "x", transport), false);
    assert.equal(syncedHashOf(ws, "main.c"), null, name);
    assert.ok(useIdeOutputBus.getState().lines.some((line) => line.text.startsWith("main.c: not saved to the sandbox")), name);
  }
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-fs-sync.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { sha16, recordEditorHash, isEchoHash, parseFsEvent } from "../../src/features/ide/model/ideFsEcho.ts";

test("sha16 equals the fs-agent hash (sha256 first 16 hex of UTF-8 bytes)", async () => {
  for (const s of ["hello", "print('café')\n", ""]) {
    const node = createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex").slice(0, 16);
    assert.equal(await sha16(s), node);
  }
});

test("echo registry: recorded hash suppresses, unknown does not", () => {
  const now = 1_000_000;
  recordEditorHash("abc123", now);
  assert.equal(isEchoHash("abc123", now + 5_000), true); // within TTL
  assert.equal(isEchoHash("never", now + 5_000), false);
});

test("echo registry: entry expires after the TTL window", () => {
  const now = 2_000_000;
  recordEditorHash("dead", now);
  assert.equal(isEchoHash("dead", now + 20_000), false); // 20s > 15s TTL
});

test("parseFsEvent accepts well-formed events, rejects noise", () => {
  assert.deepEqual(parseFsEvent('{"event":"write","path":"a.ts","hash":"h","content":"eA=="}'), {
    event: "write", path: "a.ts", hash: "h", content: "eA==",
  });
  assert.deepEqual(parseFsEvent('  {"event":"ready","path":""}\r'), { event: "ready", path: "" });
  assert.equal(parseFsEvent(""), null);
  assert.equal(parseFsEvent("not json"), null);
  assert.equal(parseFsEvent('{"path":"x"}'), null); // no event
  assert.equal(parseFsEvent('{"event":"write"}'), null); // no path
});

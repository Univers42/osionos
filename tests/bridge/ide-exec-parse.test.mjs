// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-exec-parse.test.mjs                            :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

import test from "node:test";
import assert from "node:assert/strict";

import { parseResizeFrame, extractWsAuth, createStdStreamDemux, hasActiveExec } from "../../scripts/bridge-ide-exec.mjs";
import { handshake, closeFrame } from "../../scripts/ide-ws.mjs";

test("parseResizeFrame accepts exactly one full APC frame", () => {
  assert.deepEqual(parseResizeFrame(Buffer.from("\x1b_osio-resize:120,32\x1b\\", "latin1")), { cols: 120, rows: 32 });
  assert.deepEqual(parseResizeFrame(Buffer.from("\x1b_osio-resize:1,1\x1b\\", "latin1")), { cols: 1, rows: 1 });
});

test("parseResizeFrame rejects paste noise that merely starts with the magic", () => {
  assert.equal(parseResizeFrame(Buffer.from("\x1b_osio-resize:120,32\x1b\\ls -la", "latin1")), null);
  assert.equal(parseResizeFrame(Buffer.from("\x1b_osio-resize:12", "latin1")), null); // truncated
  assert.equal(parseResizeFrame(Buffer.from("\x1b_osio-resize:a,b\x1b\\", "latin1")), null); // non-numeric
  assert.equal(parseResizeFrame(Buffer.from("plain keystrokes")), null);
  assert.equal(parseResizeFrame(Buffer.alloc(64, 0x41)), null); // oversized
});

test("extractWsAuth prefers the subprotocol token and reports the app protocol", () => {
  const request = { headers: { "sec-websocket-protocol": "osio-ide.v1, osio-token.osionos_v1.abc.def" } };
  const url = new URL("http://x/api/ide/pty?token=stale-query-token");
  assert.deepEqual(extractWsAuth(request, url), { token: "osionos_v1.abc.def", protocol: "osio-ide.v1" });
});

test("extractWsAuth falls back to the query token when no subprotocol is offered", () => {
  const url = new URL("http://x/api/ide/pty?token=qtok");
  assert.deepEqual(extractWsAuth({ headers: {} }, url), { token: "qtok", protocol: undefined });
});

test("handshake echoes the selected subprotocol", () => {
  let written = "";
  const socket = { write: (s) => { written += s; }, destroy: () => {} };
  const request = { headers: { "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", upgrade: "websocket" } };
  assert.equal(handshake(request, socket, { protocol: "osio-ide.v1" }), true);
  assert.match(written, /Sec-WebSocket-Protocol: osio-ide\.v1\r\n/);
  assert.match(written, /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=\r\n/);
});

test("closeFrame carries the status code + reason bytes", () => {
  const frame = closeFrame(4004, "no running sandbox");
  assert.equal(frame[0] & 0x0f, 8); // close opcode
  const payload = frame.subarray(2); // short frame → 2-byte header
  assert.equal(payload.readUInt16BE(0), 4004);
  assert.equal(payload.subarray(2).toString(), "no running sandbox");
});

test("std-stream demux strips 8-byte mux headers, keeps stdout, drops stderr, survives splits", () => {
  const mux = (type, text) => {
    const body = Buffer.from(text);
    const head = Buffer.alloc(8);
    head[0] = type;
    head.writeUInt32BE(body.length, 4);
    return Buffer.concat([head, body]);
  };
  const stream = Buffer.concat([mux(1, "Content-Length: 2\r\n\r\n{}"), mux(2, "server log noise"), mux(1, "tail")]);
  const feed = createStdStreamDemux();
  const collected = [];
  // feed byte-by-byte to prove reassembly across arbitrary chunk boundaries
  for (let i = 0; i < stream.length; i++) collected.push(...feed(stream.subarray(i, i + 1)));
  assert.equal(Buffer.concat(collected).toString(), "Content-Length: 2\r\n\r\n{}tail");
});

test("hasActiveExec is false for an unknown container", () => {
  assert.equal(hasActiveExec("ide-" + "0".repeat(32)), false);
});

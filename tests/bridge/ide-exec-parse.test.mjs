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

import { parseResizeFrame, extractWsAuth, createStdStreamDemux, hasActiveExec, lspCloseFor, serverCommand, LSP_SERVERS, DAP_SERVERS } from "../../scripts/bridge-ide-exec.mjs";
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
  assert.deepEqual(extractWsAuth(request), { token: "osionos_v1.abc.def", protocol: "osio-ide.v1" });
});

test("extractWsAuth ignores a query token when no subprotocol is offered", () => {
  const request = { url: "/api/ide/pty?token=qtok", headers: {} };
  assert.deepEqual(extractWsAuth(request), { token: undefined, protocol: undefined });
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

test("lspCloseFor maps exit 137 to 4137 with OOM reason", () => {
  assert.deepEqual(lspCloseFor(137), { code: 4137, reason: "language server out of memory" });
});

test("lspCloseFor maps other exit codes to 1000", () => {
  assert.deepEqual(lspCloseFor(0), { code: 1000, reason: "process ended" });
  assert.deepEqual(lspCloseFor(1), { code: 1000, reason: "process ended" });
  assert.deepEqual(lspCloseFor(null), { code: 1000, reason: "process ended" });
  assert.deepEqual(lspCloseFor(undefined), { code: 1000, reason: "process ended" });
  assert.deepEqual(lspCloseFor(255), { code: 1000, reason: "process ended" });
});

test("serverCommand returns argv for a known language from DAP_SERVERS", () => {
  assert.deepEqual(serverCommand(DAP_SERVERS, "python"), ["debugpy-adapter"]);
});

test("serverCommand returns argv for a known language from LSP_SERVERS", () => {
  assert.deepEqual(serverCommand(LSP_SERVERS, "java"), ["jdtls-launch"]);
});

test("serverCommand throws for unknown language", () => {
  assert.throws(() => serverCommand(DAP_SERVERS, "node"), { status: 400 });
  assert.throws(() => serverCommand(LSP_SERVERS, "node"), { status: 400 });
});

test("serverCommand throws for empty string", () => {
  assert.throws(() => serverCommand(DAP_SERVERS, ""), { status: 400 });
  assert.throws(() => serverCommand(LSP_SERVERS, ""), { status: 400 });
});

test("serverCommand throws for undefined", () => {
  assert.throws(() => serverCommand(DAP_SERVERS, undefined), { status: 400 });
  assert.throws(() => serverCommand(LSP_SERVERS, undefined), { status: 400 });
});

test("serverCommand throws for prototype pollution keys", () => {
  assert.throws(() => serverCommand(DAP_SERVERS, "__proto__"), { status: 400 });
  assert.throws(() => serverCommand(DAP_SERVERS, "constructor"), { status: 400 });
  assert.throws(() => serverCommand(DAP_SERVERS, "toString"), { status: 400 });
  assert.throws(() => serverCommand(LSP_SERVERS, "__proto__"), { status: 400 });
  assert.throws(() => serverCommand(LSP_SERVERS, "constructor"), { status: 400 });
  assert.throws(() => serverCommand(LSP_SERVERS, "toString"), { status: 400 });
});

test("LSP_SERVERS and DAP_SERVERS are frozen", () => {
  assert.equal(Object.isFrozen(LSP_SERVERS), true);
  assert.equal(Object.isFrozen(DAP_SERVERS), true);
});

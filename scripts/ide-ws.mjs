// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-ws.mjs                                         :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// Minimal RFC6455 WebSocket for the bridge — dep-free so the IDE PTY/LSP relays
// stay in the no-deps bridge instead of a `ws`-carrying sidecar. Server frames
// are unmasked; client frames are unmasked here. Handles text/binary/close/ping
// and single-message continuation reassembly, with a hard payload cap (this is
// a trust boundary — bytes flow to a shell's stdin).
//
// ponytail: no permessage-deflate, no streaming of >CAP messages (rejected).
// Upgrade to `ws` only if compression or huge frames ever matter.

import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE = 1 << 20; // 1 MiB per message

/** The Sec-WebSocket-Accept value for a client key (the RFC handshake proof). */
export function acceptKey(secWebSocketKey) {
  return crypto.createHash("sha1").update(secWebSocketKey + GUID).digest("base64");
}

/** Complete the HTTP upgrade on a raw socket. Returns true if it was a WS upgrade. */
export function handshake(request, socket) {
  const key = request.headers["sec-websocket-key"];
  if (!key || (request.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.destroy();
    return false;
  }
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
  );
  return true;
}

/** Encode one server→client frame (unmasked). opcode 1=text, 2=binary, 8=close. */
export function encodeFrame(payload, opcode = 2) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.from([0x80 | opcode, 126, (len >> 8) & 0xff, len & 0xff]);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, data]);
}

/**
 * Stateful decoder: feed it socket chunks, get back complete messages. Returns
 * an array of { opcode, data } per feed (usually 0 or 1). Throws on an oversized
 * message (a hostile client) so the caller can close the socket.
 */
export function createFrameDecoder() {
  let buffer = Buffer.alloc(0);
  let fragments = [];
  let fragmentOpcode = 0;

  return function feed(chunk) {
    buffer = Buffer.concat([buffer, chunk]);
    const messages = [];
    for (;;) {
      if (buffer.length < 2) break;
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let len = buffer[1] & 0x7f;
      let offset = 2;
      if (len === 126) { if (buffer.length < 4) break; len = buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buffer.length < 10) break; len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (len > MAX_MESSAGE) throw new Error("ws message too large");
      const need = offset + (masked ? 4 : 0) + len;
      if (buffer.length < need) break;

      let payload;
      if (masked) {
        const mask = buffer.subarray(offset, offset + 4);
        payload = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) payload[i] = buffer[offset + 4 + i] ^ mask[i & 3];
      } else {
        payload = buffer.subarray(offset, offset + len);
      }
      buffer = buffer.subarray(need);

      if (opcode === 0) {
        fragments.push(payload);
        if (fragments.reduce((n, f) => n + f.length, 0) > MAX_MESSAGE) throw new Error("ws message too large");
        if (fin) { messages.push({ opcode: fragmentOpcode, data: Buffer.concat(fragments) }); fragments = []; }
      } else if (opcode === 1 || opcode === 2) {
        if (fin) messages.push({ opcode, data: payload });
        else { fragmentOpcode = opcode; fragments = [payload]; }
      } else {
        messages.push({ opcode, data: payload }); // control frame (close/ping/pong)
      }
    }
    return messages;
  };
}

// `node ide-ws.mjs --selfcheck` — proves the accept-key vector + a frame round-trip.
if (process.argv[1]?.endsWith("ide-ws.mjs") && process.argv.includes("--selfcheck")) {
  const fail = [];
  // RFC6455 §1.3 canonical example.
  if (acceptKey("dGhlIHNhbXBsZSBub25jZQ==") !== "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=") fail.push("accept-key vector");
  const decode = createFrameDecoder();
  const text = "hello pty";
  // client frame is masked; simulate a masked client frame the browser would send.
  const payload = Buffer.from(text);
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = Buffer.allocUnsafe(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];
  const frame = Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]);
  const out = decode(frame);
  if (out.length !== 1 || out[0].data.toString() !== text) fail.push("masked decode round-trip");
  const server = encodeFrame(text, 1);
  if ((server[0] & 0x0f) !== 1 || server.subarray(2).toString() !== text) fail.push("server encode");
  if (fail.length) { process.stderr.write(`selfcheck FAIL:\n${fail.join("\n")}\n`); process.exit(1); }
  process.stdout.write("selfcheck OK: ws handshake + frame codec correct\n");
  process.exit(0);
}

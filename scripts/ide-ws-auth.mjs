// The pure WebSocket seams shared by every route that upgrades with an IDE token: resize-frame
// parse, subprotocol auth extraction, token-expiry close and the pre-handshake refusal. They live
// apart from bridge-ide-exec.mjs so the relay can use them without importing any docker code.

import { closeFrame } from './ide-ws.mjs';

// APC-wrapped PTY-resize control frame: `ESC _ osio-resize:COLS,ROWS ESC \`.
// Strict FULL-frame match — prefix-only matching let pasted bytes that happen
// to start with the magic trigger a bogus resize.
const ESC = String.fromCharCode(27);
const RESIZE_RE = /^_osio-resize:(\d{1,4}),(\d{1,4})$/;

/** Parse a complete resize control frame; null for anything else (incl. paste
 *  noise). Exported pure for tests. */
export function parseResizeFrame(data) {
  if (data.length > 26) return null;
  const text = data.toString('latin1');
  if (!text.startsWith(ESC) || !text.endsWith(`${ESC}\\`)) return null;
  const payload = text.slice(1, -2);
  const match = RESIZE_RE.exec(payload);
  return match && match[0].length === payload.length ? { cols: Number(match[1]), rows: Number(match[2]) } : null;
}

/** Auth rides the WS subprotocol (`osio-token.<jwt>` alongside `osio-ide.v1`)
 *  so the token stays out of URLs/access logs. The token comes ONLY from the
 *  subprotocol entry; a missing entry yields undefined, which the existing
 *  verify step already refuses. Exported pure for tests. */
export function extractWsAuth(request) {
  const offered = String(request.headers['sec-websocket-protocol'] ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const tokenEntry = offered.find((p) => p.startsWith('osio-token.'));
  return {
    token: tokenEntry ? tokenEntry.slice('osio-token.'.length) : undefined,
    protocol: offered.includes('osio-ide.v1') ? 'osio-ide.v1' : undefined,
  };
}

/** An IDE token lives at most 15 minutes; a socket opened with one must not outlive it. App tokens
 *  carry no `exp` here, so nothing is armed for them. `exp` is in seconds, `now` in ms.
 *  Caveat: the timer is wall-clock; a host clock stepped backwards after arming closes the
 *  socket late (by the step), never early. */
export function armTokenExpiry(socket, exp, now = Date.now()) {
  if (!Number.isFinite(exp)) return;
  const timer = setTimeout(() => {
    if (!socket.destroyed) socket.end(closeFrame(4011, 'token expired'));
  }, Math.max(0, exp * 1000 - now));
  timer.unref();
  socket.once('close', () => clearTimeout(timer));
}

/** Refuse a WS upgrade before the handshake: a plain HTTP status the browser
 *  surfaces in devtools (a close code needs a completed handshake first). */
export function rejectUpgrade(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

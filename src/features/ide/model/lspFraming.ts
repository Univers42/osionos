/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lspFraming.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The LSP base protocol (`Content-Length: N\r\n\r\n<json>`) codec, in the
// browser. @codemirror/lsp-client's Transport exchanges bare JSON strings, but
// the language server speaks framed stdio and the bridge relays raw bytes — so
// the frontend adds the frame on send and strips it on receive. Byte-accurate
// (Content-Length is UTF-8 bytes, not chars) and handles messages split across
// or coalesced within WS frames.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Wrap a JSON-RPC message in an LSP `Content-Length` frame. */
export function frameLsp(message: string): Uint8Array {
  const body = encoder.encode(message);
  const header = encoder.encode(`Content-Length: ${body.length}\r\n\r\n`);
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}

/** Index of the `\r\n\r\n` header terminator, or -1 if not yet present. */
function findHeaderEnd(b: Uint8Array): number {
  for (let i = 0; i + 3 < b.length; i++) {
    if (b[i] === 13 && b[i + 1] === 10 && b[i + 2] === 13 && b[i + 3] === 10) return i;
  }
  return -1;
}

/** Stateful deframer: feed raw bytes, emit each complete JSON-RPC body once its
 *  declared Content-Length has arrived. Buffers partial frames across feeds. */
export function createLspFramer() {
  let buf = new Uint8Array(0);
  return {
    feed(chunk: Uint8Array, emit: (message: string) => void): void {
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf, 0);
      merged.set(chunk, buf.length);
      buf = merged;
      for (;;) {
        const sep = findHeaderEnd(buf);
        if (sep < 0) return; // header incomplete
        const header = decoder.decode(buf.subarray(0, sep));
        const match = /content-length:\s*(\d+)/i.exec(header);
        const bodyStart = sep + 4;
        if (!match) { buf = buf.subarray(bodyStart); continue; } // malformed header, skip
        const len = Number(match[1]);
        if (buf.length < bodyStart + len) return; // body incomplete — wait for more
        emit(decoder.decode(buf.subarray(bodyStart, bodyStart + len)));
        buf = buf.subarray(bodyStart + len);
      }
    },
  };
}

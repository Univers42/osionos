/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   chat-file-validation.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #177: the composer refuses a file before a byte is sent: an executable by its
// extension, anything over its kind's cap. The bridge checks again (P0-6:
// tests/bridge/bridge-upload-content-check.test.mjs), so this is the fast half.

import assert from "node:assert/strict";
import test from "node:test";

import { MEDIA_LIMITS, validateFile } from "../../src/shared/chat/mediaProcessing.ts";

/** Only name, type and size are read, so a 50MB file needs no 50MB buffer. */
const fileOf = (name: string, type: string, size: number) => ({ name, type, size }) as File;

test("documents, images, video and audio under their cap are accepted with their kind", () => {
  assert.deepEqual(validateFile(fileOf("plan.pdf", "application/pdf", 200_000)), { ok: true, kind: "file" });
  assert.deepEqual(validateFile(fileOf("a.png", "image/png", 10)), { ok: true, kind: "image" });
  assert.deepEqual(validateFile(fileOf("a.mp4", "video/mp4", 10)), { ok: true, kind: "video" });
  assert.deepEqual(validateFile(fileOf("a.ogg", "audio/ogg", 10)), { ok: true, kind: "audio" });
});

test("an executable is refused by its extension, whatever its declared type", () => {
  const result = validateFile(fileOf("setup.EXE", "application/octet-stream", 10));
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.error : "", /setup\.EXE.*executable/);
});

test("each kind is refused one byte over its own cap, and accepted at it", () => {
  const cases = [["a.png", "image/png", "image"], ["a.mp4", "video/mp4", "video"], ["a.ogg", "audio/ogg", "audio"], ["a.pdf", "application/pdf", "file"]] as const;
  for (const [name, type, kind] of cases) {
    assert.equal(validateFile(fileOf(name, type, MEDIA_LIMITS[kind])).ok, true, `${kind} at its cap`);
    const over = validateFile(fileOf(name, type, MEDIA_LIMITS[kind] + 1));
    assert.equal(over.ok, false, `${kind} over its cap`);
    assert.match(!over.ok ? over.error : "", /over the .* limit/);
  }
});

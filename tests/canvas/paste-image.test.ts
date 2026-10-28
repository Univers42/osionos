/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   paste-image.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 20:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  insertPastedImage,
  pastedImageFile,
  pastedImageSource,
} from "../../src/features/block-editor/model/pasteImage.ts";

function clipboard(types: Record<string, string>, files: File[] = []) {
  return { getData: (type: string) => types[type] ?? "", files: files as unknown as FileList };
}

const PNG = new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" });

test("a screenshot (a picture and nothing else) is the pasted image", () => {
  assert.equal(pastedImageFile(clipboard({}, [PNG])), PNG);
});

test("a picture copied from a page carries its own URL as html, so the browser keeps it", () => {
  assert.equal(pastedImageFile(clipboard({ "text/html": '<img src="https://a.test/x.png">' }, [PNG])), null);
});

test("text, or a non-image file, is not a pasted image", () => {
  assert.equal(pastedImageFile(clipboard({ "text/plain": "hello" }, [PNG])), null);
  const pdf = new File(["%PDF"], "a.pdf", { type: "application/pdf" });
  assert.equal(pastedImageFile(clipboard({}, [pdf])), null);
  assert.equal(pastedImageFile(clipboard({})), null);
});

test("the picture lands as an inline image over the selection", () => {
  assert.equal(insertPastedImage("ab cd", "https://m.test/1.png", { start: 3, end: 5 }), "ab ![](https://m.test/1.png)");
  assert.equal(insertPastedImage("ab", "https://m.test/1.png", { start: 9, end: 9 }), "ab![](https://m.test/1.png)");
});

test("an uploaded picture is a URL, never base64 that fills the browser storage", async () => {
  const src = await pastedImageSource(PNG, async () => "https://m.test/api/media/1.png");
  assert.equal(src, "https://m.test/api/media/1.png");
});

test("offline, the picture is kept inline so the paste is not lost", async () => {
  const src = await pastedImageSource(PNG, async () => {
    throw new Error("offline");
  });
  assert.equal(src, "data:image/png;base64,iVBORw==");
});

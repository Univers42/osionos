// A pasted picture must reach the server as a file, never ride inside the page as base64.
// Live, 2026-10-28: an image-only clipboard fell through handlePaste to the browser default,
// the picture landed inline, and the page outgrew both the edge limit and localStorage.

import assert from "node:assert/strict";
import test from "node:test";

import { pastedImageFile } from "@/features/block-editor/model/pastedImage";

const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

function clipboard(types: Record<string, string>, files: File[] = []) {
  return { files: files as unknown as FileList, getData: (type: string) => types[type] ?? "" };
}

test("an image file on the clipboard is the paste", () => {
  const png = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
  assert.equal(pastedImageFile(clipboard({ "text/html": "<img src=x>" }, [png])), png);
});

test("an <img> data URL in pasted HTML becomes a file", async () => {
  const file = pastedImageFile(clipboard({ "text/html": `<meta charset="utf-8"><img src="${GIF}" alt="">` }));
  assert.equal(file?.type, "image/gif");
  assert.equal(file?.name, "pasted-image.gif");
});

test("text on the clipboard wins: no picture is taken from a text paste", () => {
  const png = new File([new Uint8Array([1])], "cells.png", { type: "image/png" });
  assert.equal(pastedImageFile(clipboard({ "text/plain": "a\tb" }, [png])), null);
  assert.equal(pastedImageFile(clipboard({ "text/markdown": "# t" }, [png])), null);
});

test("no image, no file: null", () => {
  const pdf = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
  assert.equal(pastedImageFile(clipboard({}, [pdf])), null);
  assert.equal(pastedImageFile(clipboard({ "text/html": '<img src="https://x/a.png">' })), null);
});

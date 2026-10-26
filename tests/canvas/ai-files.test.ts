import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { mergeAttachments, toRunAttachments } from "@/features/chat/model/assistantHandoff";
import type { ComposerAttachment } from "@/features/chat/model/assistantHandoff";
import { runError } from "@/features/chat/model/runErrors";
import { AttachButton, uploadableFile } from "@/widgets/chat-shell/ui/AttachButton";

const CSV: ComposerAttachment = { path: `/api/media/uploads/u/${"a".repeat(64)}.csv`, name: "data.csv", kind: "file" };
const PNG: ComposerAttachment = { path: `/api/media/uploads/u/${"b".repeat(64)}.png`, name: "pic.png", kind: "image" };

const render = (props: Partial<React.ComponentProps<typeof AttachButton>>) =>
  renderToStaticMarkup(React.createElement(AttachButton, { attachments: [], onChange: () => {}, ...props }));

test("the button renders on a model without vision", () => {
  assert.match(render({ vision: false }), /aria-label="Attach file"/);
});

test("the picker accepts images and text files", () => {
  const html = render({});
  assert.match(html, /accept="[^"]*image\/png[^"]*"/);
  assert.match(html, /accept="[^"]*\.csv[^"]*"/);
});

test("a file chip shows its name and a remove button named after it", () => {
  const html = render({ attachments: [CSV] });
  assert.match(html, /data-testid="file-chip"/);
  assert.match(html, />data\.csv</);
  assert.match(html, /aria-label="Remove data\.csv"/);
});

test("an image chip stays an image", () => {
  assert.match(render({ vision: true, attachments: [PNG] }), /data-testid="image-chip"/);
});

test("the run sends a media attachment with its path and name", () => {
  assert.deepEqual(toRunAttachments([CSV]), [{ kind: "media", path: CSV.path, name: "data.csv" }]);
});

test("merging keeps names and dedupes by path", () => {
  const again = { ...CSV, name: "renamed.csv" };
  assert.deepEqual(mergeAttachments([CSV], [again, PNG], 4), [CSV, PNG]);
});

test("an unsupported file says what can be read", () => {
  assert.match(runError("unsupported_file").text, /This file type can't be read yet/);
});

test("a markup file uploads as plain text, since the bridge refuses markup types", () => {
  const html = uploadableFile(new File(["<p>hi</p>"], "page.html", { type: "text/html" }));
  assert.equal(html.file.type, "text/plain");
  assert.equal(html.file.name, "page.html");
  assert.equal(html.kind, "file");
  assert.equal(uploadableFile(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })).kind, "file");
  const csv = new File(["a,b"], "data.csv", { type: "text/csv" });
  assert.equal(uploadableFile(csv).file, csv);
  assert.equal(uploadableFile(new File([""], "p.png", { type: "image/png" })).kind, "image");
});

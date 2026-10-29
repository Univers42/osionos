/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   link-mention-render.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { serializeInlineNodes } from "../../packages/markdown-engine/inlineAst.ts";
import { parseInline } from "../../packages/markdown-engine/markdown/parserInline.ts";
import { renderInlineNodesToHtml } from "../../packages/markdown-engine/markdown/renderers/inlineHtml.ts";
import { mentionFaviconSrc, mentionHost } from "../../packages/markdown-engine/markdown/linkMention.ts";

const MENTION = '[Example Domain](https://example.com/a/b?q=1 "osio:mention")';
const html = (source: string, options = {}) => renderInlineNodesToHtml(parseInline(source), options);

test("the mention marker survives parse and serialize, with text around it", () => {
  const source = `see ${MENTION} now`;
  assert.equal(serializeInlineNodes(parseInline(source)), source);
});

test("a mention renders as an editor-link chip with a same-origin favicon and the host as tooltip", () => {
  const out = html(MENTION);
  assert.match(out, /<a [^>]*class="editor-link editor-link-mention"/);
  assert.match(out, /data-link-mention="true"/);
  assert.match(out, /title="example\.com"/);
  assert.match(out, /<img class="editor-link-favicon" data-link-favicon="true" src="https:\/\/example\.com\/favicon\.ico" alt="" loading="lazy" \/>/);
  assert.match(out, /<\/a>​$/);
  assert.doesNotMatch(out, /osio:mention/, "the marker is never a tooltip or visible text");
});

test("a plain link is unchanged: editor tooltip, no favicon, no mention class", () => {
  const out = html("[x](https://example.com/a)");
  assert.doesNotMatch(out, /editor-link-mention|<img|data-link-mention/);
  assert.match(out, /title="Ctrl\/⌘-click to edit/);
  assert.match(html('[x](https://example.com/a "Tip")'), /title="Tip"/);
});

test("a mention with a non-http href renders no favicon", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,x", "mailto:a@b.co", "page:abc"]) {
    const out = html(`[x](${href} "osio:mention")`);
    assert.doesNotMatch(out, /<img/, href);
    assert.doesNotMatch(out, /javascript:/);
  }
  assert.equal(mentionFaviconSrc("https://u:p@example.com/"), "", "userinfo is refused");
  assert.equal(mentionFaviconSrc("https://example.com:8443/x"), "https://example.com:8443/favicon.ico");
  assert.equal(mentionHost("not a url"), "");
});

test("a mention title cannot inject markup", () => {
  const out = html('[<img src=x onerror=1>](https://example.com/ "osio:mention")');
  assert.doesNotMatch(out, /<img src=x/);
});

test("raw-source reveal keeps the marker so the link can be edited as markdown", () => {
  assert.equal(html(MENTION, { renderLinkAsSource: true }), MENTION.replace(/"/g, "&quot;"));
});

test("a mention whose href carries credentials or a non-http scheme is plain text, not a chip", () => {
  for (const href of ["https://google.com@evil.example/", "https://u:p@example.com/", "javascript:alert(1)", "mailto:a@b.co"]) {
    const out = html(`[google.com](${href} "osio:mention")`);
    assert.equal(out, "google.com", href);
  }
  assert.match(html('[google.com](https://google.com/ "osio:mention")'), /<a /, "a verifiable mention is still a chip");
});

test("the React renderer applies the same unverifiable-mention guard", () => {
  const source = readFileSync(new URL("../../packages/markdown-engine/markdown/renderers/reactHelpers.tsx", import.meta.url), "utf8");
  assert.match(source, /isMention && mentionHost\(href\) === ""/);
});

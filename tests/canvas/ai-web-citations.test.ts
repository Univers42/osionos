/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-web-citations.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



/**
 * Web sources: a `collection:"web"` citation is kept only for an https URL,
 * renders as a link that never loads anything, and the web tools read plainly.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { citationOf } from "@/features/chat/model/citations";
import { renderCitationSources, renderCitedAnswer } from "@/features/chat/model/citedAnswer";
import { influencedByWords } from "@/features/chat/model/approvalCard";
import { permissionFromEvent } from "@/features/chat/model/approvalParts";
import { toolActivityLine } from "@/features/chat/model/toolActivityLine";

const web = (url: unknown) => ({ n: 1, collection: "web", url, domain: "docs.example.org", title: "T", snippet: "S" });

test("a web citation with an https url parses", () => {
  const citation = citationOf(web("https://docs.example.org/a?b=1"), null);
  assert.equal(citation?.collection, "web");
  assert.equal(citation?.collection === "web" && citation.domain, "docs.example.org");
});

test("a web citation without an https url is dropped", () => {
  for (const url of ["http://docs.example.org", "javascript:alert(1)", undefined, "not a url", "data:text/html,x", 5]) {
    assert.equal(citationOf(web(url), null), null, String(url));
  }
});

test("page and pack citations parse as before", () => {
  const page = citationOf({ n: 1, collection: "page", pageId: "p1", title: "T", snippet: "S" }, null);
  assert.equal(page?.collection, "page");
  const pack = citationOf({ n: 2, collection: "pack", pack: "docs", title: "T", snippet: "S" }, null);
  assert.equal(pack?.collection, "pack");
});

test("the web chip is a safe new-tab link and loads nothing", () => {
  const citation = citationOf(web("https://docs.example.org/a"), null)!;
  const out = renderToStaticMarkup(renderCitationSources([citation], () => assert.fail("opened as a page"))!);
  assert.match(out, /<a [^>]*href="https:\/\/docs\.example\.org\/a"/);
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener noreferrer"/);
  assert.match(out, /1\. docs\.example\.org/);
  assert.doesNotMatch(out, /<img/i);
});

test("the in-text marker of a web source is a safe link too", () => {
  const citation = citationOf(web("https://docs.example.org/a"), null)!;
  const out = renderToStaticMarkup(
    React.createElement(React.Fragment, null, ...renderCitedAnswer("Claim [1].", [citation], () => assert.fail("opened"))),
  );
  assert.match(out, /rel="noopener noreferrer"/);
  assert.doesNotMatch(out, /<img/i);
});

test("the web tools read in plain words", () => {
  const line = (toolName: string, status: "running" | "done" | "failed") =>
    toolActivityLine({ type: "tool-activity", toolCallId: "c", toolName, label: "", status })
      .map((piece) => piece.text)
      .join("");
  assert.match(line("web_search", "done"), /Searched the web/);
  assert.match(line("web_fetch", "done"), /Read a web page/);
});

test("an approval names what influenced it", () => {
  assert.equal(
    influencedByWords(["web:docs.example.org", "mcp:fake"]),
    "Influenced by: docs.example.org (web), fake (MCP)",
  );
  assert.equal(influencedByWords(undefined), "");
  assert.equal(influencedByWords(["junk"]), "");
  const part = permissionFromEvent({
    approvalId: "p", tool: "x", influencedBy: ["web:a.org", 3, ""],
  });
  assert.deepEqual(part?.influencedBy, ["web:a.org"]);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-dock-citations.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #84: the dock dropped the service's `citation` frames, so its answer showed a bare "[1]"
// where the Assistant pane shows a source button and the list of sources under the answer.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Citation } from "@/features/chat/model/citations";
import { runAiDockTurn } from "@/widgets/contact-dock/model/aiDockModel";
import { DockAnswer } from "@/widgets/contact-dock/ui/AiDockPanel";

const SOURCE: Citation = { collection: "page", n: 1, pageId: "page-q3", title: "Q3 report", snippet: "Revenue rose 12%." };

test("a citation frame reaches the dock as a source; a frame with no page is dropped", async () => {
  const cited: Citation[] = [];
  await runAiDockTurn({
    port: {
      complete: async () => ({ content: "" }),
      stream: async (_request, onEvent) => {
        onEvent("citation", { n: 1, pageId: "page-q3", title: "Q3 report", snippet: "Revenue rose 12%." });
        onEvent("citation", { n: 2, title: "no page" });
        onEvent("text.delta", { text: "Revenue rose [1]." });
        onEvent("done", {});
      },
    },
    conversationId: "dock-c",
    text: "Q3?",
    onDelta: () => undefined,
    onCitation: (citation) => cited.push(citation),
  });
  assert.deepEqual(cited, [SOURCE]);
});

test("the dock's answer marks a cited source and lists it, like the Assistant pane", () => {
  const html = renderToStaticMarkup(React.createElement(DockAnswer, { body: "Revenue rose [1].", citations: [SOURCE] }));
  assert.match(html, /<button[^>]*aria-label="Source 1: Q3 report"/);
  assert.match(html, /data-testid="chat-sources"/);
  assert.match(html, /Open source 1: Q3 report/);
  assert.doesNotMatch(html, /\[1\]/);
});

test("an answer with no sources stays plain markdown", () => {
  const html = renderToStaticMarkup(React.createElement(DockAnswer, { body: "No sources **here**.", citations: [] }));
  assert.match(html, /<strong>here<\/strong>/);
  assert.doesNotMatch(html, /chat-sources/);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-add-blocks-card.test.ts                         :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The card of add_blocks (devil C232, C239): the full text of every block is
 * on the card, a done write says the page version it made, and the page the
 * write changed is read again so the editor shows the blocks.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { approvalArgs, decideApprovalCard, stateWords } from "@/features/chat/model/approvalCard";
import { setApprovalTransport, type ApprovalDescription } from "@/features/chat/model/approvals";
import { reloadWrittenPage } from "@/features/chat/model/reloadWrittenPage";
import { ApprovalCard } from "@/features/chat/ui/ApprovalCard";
import { usePageStore } from "@/store/usePageStore";

const SUMMARY = "2 blocks were added after the block shown on the card (page version 4).";

function addBlocksCard(overrides: Partial<ApprovalDescription> = {}): ApprovalDescription {
  return {
    approvalId: "approval-add",
    tool: "add_blocks",
    verb: "Add to a page",
    status: "pending",
    target: { pageId: "page-1", title: "The notes", workspaceId: "workspace-1", workspaceName: "Marketing" },
    args: {
      pageId: "page-1",
      blocks: [
        { type: "heading_2", content: "Release" },
        { type: "paragraph", content: "Released in 2011." },
      ],
      afterBlockId: "b-intro",
      afterBlockText: "Call Me Maybe",
    },
    preview: { unit: "blocks", count: 2 },
    approvedInRun: 0,
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function render(card: ApprovalDescription): string {
  return renderToStaticMarkup(React.createElement(ApprovalCard, { approvalId: card.approvalId, approval: card }));
}

test("the blocks read as one `[type] text` line each, every character kept (C232)", () => {
  const blocks = approvalArgs(addBlocksCard().args).find((arg) => arg.name === "blocks");
  assert.equal(blocks?.value, "[heading_2] Release\n[paragraph] Released in 2011.");
});

test("a code block's language is on its line, so a diagram reads as one (#34)", () => {
  const args = approvalArgs({ blocks: [{ type: "code", language: "mermaid", content: "flowchart TD\n  A --> B" }] });
  assert.equal(args[0].value, "[code mermaid] flowchart TD\n  A --> B");
});

test("a list that is more than type and text stays its JSON: nothing is hidden", () => {
  const args = approvalArgs({ content: [{ id: "b1", type: "paragraph", content: "x" }] });
  assert.equal(args[0].value, '[{"id":"b1","type":"paragraph","content":"x"}]');
});

test("a block's text is text on the card, never markup", () => {
  const html = render(
    addBlocksCard({ args: { pageId: "page-1", blocks: [{ type: "paragraph", content: "<img src=x onerror=alert(1)>" }] } }),
  );
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /\[paragraph\] &lt;img src=x onerror=alert\(1\)&gt;/);
});

test("the card names the block the new ones follow", () => {
  assert.match(render(addBlocksCard()), /Call Me Maybe/);
});

test("a done write says the page version it made, never a bare Done (C239)", () => {
  assert.equal(stateWords("executed", null, SUMMARY), SUMMARY);
  assert.equal(stateWords("executed", null, null), "Done", "a write that recorded nothing still ends");
  const html = render(addBlocksCard({ status: "executed", summary: SUMMARY }));
  assert.match(html, /page version 4/);
  assert.doesNotMatch(html, />Done</);
});

test("the decision carries the summary of the write", async () => {
  setApprovalTransport(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        approvalId: "approval-add",
        status: "executed",
        result: { ok: true, pageId: "page-1", version: 4, placed: "after", summary: SUMMARY },
        error: null,
        continuationRunId: null,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  const outcome = await decideApprovalCard("approval-add", "approve");
  assert.equal(outcome.kind, "decided");
  assert.equal(outcome.kind === "decided" ? outcome.summary : null, SUMMARY);
});

test("the page add_blocks wrote is read again, and only that write reloads (C239)", () => {
  const original = usePageStore.getState().fetchPageContent;
  const reads: [string, string][] = [];
  usePageStore.setState({
    fetchPageContent: async (pageId: string, jwt: string) => {
      reads.push([pageId, jwt]);
    },
  });
  try {
    assert.equal(reloadWrittenPage("add_blocks", "page-1", "token-1"), true);
    assert.equal(reloadWrittenPage("rename_page", "page-1", "token-1"), false, "a rename leaves the content alone");
    assert.equal(reloadWrittenPage("add_blocks", "page-1", null), false, "no session, no read");
    assert.deepEqual(reads, [["page-1", "token-1"]]);
  } finally {
    usePageStore.setState({ fetchPageContent: original });
  }
});

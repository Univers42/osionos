/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-approval-card.test.ts                           :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The card of a write: what the user sees, and what the user can do.
 *
 * The card is the only place the user sees what the assistant is about to
 * write. The rules it holds are the rules of the verdict: every argument is
 * shown, verbatim and as text; the target is named; the page the request
 * comes from is named; the writes of the run that are already approved are
 * counted; and each state of the approval says its own thing.
 *
 * There is no axe helper in this suite — it has no DOM and no axe-core — so
 * the accessibility of the card is checked structurally: real buttons, real
 * labels, a live region for the state, and a visible focus.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ChatMessagePart } from "@/features/chat/model/chatTypes";
import { permissionsFromParts } from "@/features/chat/model/approvalParts";
import { fetchApproval, setApprovalTransport, type ApprovalDescription } from "@/features/chat/model/approvals";
import { ApprovalCard } from "@/features/chat/ui/ApprovalCard";

/* -------------------------------------------------------------------------- */
/* The card, as the service describes it                                      */
/* -------------------------------------------------------------------------- */

/** The card of a write, with the fields the service sends. */
function approval(overrides: Partial<ApprovalDescription> = {}): ApprovalDescription {
  return {
    approvalId: "approval-1",
    tool: "create_page",
    verb: "Create a page",
    status: "pending",
    target: { title: "The report", workspaceId: "workspace-1", workspaceName: "Marketing" },
    args: { title: "The report" },
    preview: { unit: "blocks", count: 2 },
    approvedInRun: 0,
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** The card, as the browser would show it. */
function renderCard(
  card: ApprovalDescription | null,
  props: { provenanceTitles?: readonly string[]; onOpenPage?: (pageId: string) => void } = {},
): string {
  return renderToStaticMarkup(
    React.createElement(ApprovalCard, {
      approvalId: card?.approvalId ?? "approval-1",
      approval: card,
      ...props,
    }),
  );
}

/** A JSON answer of the service. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------- */
/* What the card says                                                          */
/* -------------------------------------------------------------------------- */

test("the card names the tool, the target and the workspace", () => {
  const html = renderCard(approval());
  assert.match(html, /Create a page/, "the tool is in words");
  assert.match(html, /The report/, "the target is named");
  assert.match(html, /Marketing/, "the workspace is named");
});

test("every argument is shown, verbatim", () => {
  const html = renderCard(
    approval({
      args: { title: "The report", workspaceId: "workspace-1", content: [{ id: "b1", type: "paragraph" }] },
    }),
  );
  assert.match(html, /title/);
  assert.match(html, /The report/);
  assert.match(html, /workspaceId/);
  assert.match(html, /workspace-1/);
  assert.match(html, /content/);
  assert.match(html, /paragraph/, "the argument is shown as it is");
});

test("an argument is text, never markup (C9)", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const html = renderCard(approval({ args: { title: hostile } }));
  assert.doesNotMatch(html, /<img/i, "the payload is never an element");
  assert.match(
    html,
    /<dd[^>]*>&lt;img src=x onerror=alert\(1\)&gt;<\/dd>/,
    "the payload is the text of the argument, with no markup around it",
  );
});

test("the card shows the scope of the write and the writes of the run", () => {
  const html = renderCard(approval({ preview: { unit: "blocks", count: 2 }, approvedInRun: 3 }));
  assert.match(html, /2 blocks/, "the preview counts what the write touches");
  assert.match(html, /3 writes are already approved in this run/);
});

test("the card says when the question closes itself", () => {
  const html = renderCard(approval({ expiresAt: new Date(Date.now() + 9 * 60_000).toISOString() }));
  assert.match(html, /closes itself in 9 minutes/);
});

test("the page the request comes from is named", () => {
  const html = renderCard(approval(), { provenanceTitles: ["The budget"] });
  assert.match(html, /Asked from: The budget/);
});

test("a request with no known page says nothing about it", () => {
  const html = renderCard(approval());
  assert.doesNotMatch(html, /Asked from/);
});

/* -------------------------------------------------------------------------- */
/* The states                                                                  */
/* -------------------------------------------------------------------------- */

test("a pending card offers the decision", () => {
  const html = renderCard(approval({ status: "pending" }));
  assert.match(html, /Approve/);
  assert.match(html, /Decline/);
  assert.doesNotMatch(html, /Writing/);
});

test("an executing card writes", () => {
  const html = renderCard(approval({ status: "executing" }));
  assert.match(html, /Writing/);
  assert.doesNotMatch(html, /Approve/, "there is nothing to decide any more");
});

test("an executed card is done, and links the page", () => {
  const html = renderCard(
    approval({
      status: "executed",
      target: { pageId: "page-1", title: "The report", workspaceId: "workspace-1", workspaceName: "Marketing" },
    }),
    { onOpenPage: () => undefined },
  );
  assert.match(html, /Done/);
  assert.match(html, /Open the page/);
});

test("a failed card says the error in words", () => {
  const html = renderCard(approval({ status: "failed" }));
  assert.match(html, /The write failed/);
});

test("a declined card says so", () => {
  assert.match(renderCard(approval({ status: "declined" })), /Declined/);
});

test("an expired card asks again", () => {
  assert.match(renderCard(approval({ status: "expired" })), /Expired — ask again/);
});

test("an unknown card says the write may have happened (C7)", () => {
  assert.match(
    renderCard(approval({ status: "unknown" })),
    /May have been written — check the page/,
  );
});

test("a status the client does not know is the unknown one", () => {
  const html = renderCard(approval({ status: "something-else" }));
  assert.match(html, /May have been written — check the page/);
  assert.match(html, /data-status="unknown"/);
});

/* -------------------------------------------------------------------------- */
/* The accessibility of the card                                               */
/* -------------------------------------------------------------------------- */

test("the card is reachable with the keyboard, and says what it does", () => {
  const html = renderCard(approval({ status: "pending" }));
  assert.match(html, /<button[^>]*type="button"[^>]*>Approve</, "the buttons are real buttons");
  assert.match(html, /<button[^>]*type="button"[^>]*>Decline</);
  assert.match(html, /aria-label="Approve this write"/);
  assert.match(html, /aria-label="Decline this write"/);
  assert.match(html, /focus-visible:ring-2/, "the focus is visible");
  assert.doesNotMatch(html, /tabindex="[1-9]/, "the card takes no trap");
});

test("the state of the card is announced when it changes", () => {
  const html = renderCard(approval({ status: "executed" }));
  assert.match(html, /aria-live="polite"/);
});

/* -------------------------------------------------------------------------- */
/* The card of a reloaded conversation                                         */
/* -------------------------------------------------------------------------- */

test("a reloaded message draws its card again (C6)", async () => {
  const urls: string[] = [];
  setApprovalTransport(async (input) => {
    urls.push(String(input));
    return jsonResponse(approval());
  });

  // The message of the assistant, as the service keeps it: the id of the
  // approval, and the tool that asked.
  const parts: ChatMessagePart[] = [{ type: "permission", approvalId: "approval-1", tool: "create_page" }];
  const permissions = permissionsFromParts(parts);
  assert.equal(permissions.length, 1, "the message carries the card");
  assert.equal(permissions[0].approvalId, "approval-1");

  // The card asks the service about the id, and the service answers with the
  // card, rebuilt from the row.
  const found = await fetchApproval(permissions[0].approvalId);
  assert.match(urls[0], /\/approvals\/approval-1$/, "the card is fetched by its id");
  assert.equal(found.verb, "Create a page");

  // And the card is drawn from it.
  const html = renderCard(found);
  assert.match(html, /Create a page/);
  assert.match(html, /Approve/);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ApprovalCard.tsx                                   :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The card of a write: what the assistant wants to write, and the user's
 * decision.
 *
 * The card is drawn from the approval of the service — the row, rebuilt from
 * the real arguments — and it is drawn the same way whether the request just
 * arrived or the conversation was reloaded: the id of the approval is all the
 * card needs.
 *
 * EVERY ARGUMENT IS TEXT. The titles, the workspace, the arguments, the
 * preview: they are written as text nodes, never as markup, never as
 * markdown, and never as an image the reader's browser would fetch.
 *
 * The buttons are the only way to decide. There is no shortcut, no global
 * key, and nothing in the conversation — a word, a dictation, a message —
 * ever decides anything: the card listens to its own buttons and to nothing
 * else (C65).
 *
 * The file holds NO JSX on purpose: the canvas suite runs the card under
 * node, and node reads a `.tsx` file as TypeScript.
 */

import React, { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import {
  approvalArgs,
  approvalCardState,
  approvedInRunWords,
  decideApprovalCard,
  expiryWords,
  previewWords,
  refusalWords,
  resumeApprovalCard,
  stateWords,
  type ApprovalOutcome,
} from "../model/approvalCard";
import { fetchApproval, type ApprovalChoice, type ApprovalDescription } from "../model/approvals";
import { decisionItems, keptKeys, planTree, type PlanNode } from "../model/planTree";

export interface ApprovalCardProps {
  /** The id of the approval: the card asks the service about it. */
  approvalId: string;
  /** The card, when the client already holds it. */
  approval?: ApprovalDescription | null;
  /** The pages the request comes from, by title — when they are known. */
  provenanceTitles?: readonly string[];
  /** Opens the page the write touches. */
  onOpenPage?: (pageId: string) => void;
  /** The follow-up of the write: the assistant's answer after it. */
  onContinuation?: (runId: string) => void;
}

/** The frame of the card: a border, and the room of a small note. */
const CARD =
  "mt-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-muted)] p-2.5 text-xs text-[var(--osio-fg-default)]";

/** The button of the card: quiet, and the reader's finger finds it. */
const BUTTON =
  "cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";

/** The card of a write, as the reader sees it. */
export const ApprovalCard: React.FC<ApprovalCardProps> = (props) => {
  const { approvalId, approval: known, onOpenPage, onContinuation } = props;
  const [approval, setApproval] = useState<ApprovalDescription | null>(known ?? null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(() => new Set());

  // The card the client does not hold: the service rebuilds it from the row.
  // This is the path of a reloaded conversation.
  const held = known !== undefined && known !== null;
  useEffect(() => {
    if (held) return undefined;
    let alive = true;
    void fetchApproval(approvalId)
      .then((found) => {
        if (alive) setApproval(found);
      })
      .catch(() => {
        if (alive) setFailure("The card of this request could not be read.");
      });
    return () => {
      alive = false;
    };
  }, [approvalId, held]);

  /** The decision of the user: one click, one POST. */
  // The decision and the resume end the same way: the card shows what came of the POST.
  const settle = async (post: () => Promise<ApprovalOutcome>): Promise<void> => {
    setBusy(true);
    setFailure("");
    const outcome = await post();
    setBusy(false);
    if (outcome.kind === "busy") return;
    if (outcome.kind === "conflict") {
      // The approval was already decided: the card says what happened.
      setApproval(outcome.approval);
      return;
    }
    if (outcome.kind === "failed") {
      setFailure(refusalWords(outcome.code));
      return;
    }
    setError(outcome.error);
    setApproval((current) => (current ? { ...current, status: outcome.status } : current));
    if (outcome.continuationRunId) onContinuation?.(outcome.continuationRunId);
  };

  const decide = (choice: ApprovalChoice, items?: string[]): Promise<void> =>
    settle(() => decideApprovalCard(approvalId, choice, items));

  const toggle = (key: string, currentlyOn: boolean): void => {
    setOff((prev) => {
      const next = new Set(prev);
      if (currentlyOn) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const resume = (): Promise<void> => settle(() => resumeApprovalCard(approvalId));

  const state = approvalCardState(approval?.status ?? "pending");
  const target = approval?.target;
  const titles = props.provenanceTitles ?? [];
  const pageId = target?.pageId;
  const isPlan = approval?.tool === "build_plan";
  const tree = isPlan && approval ? planTree(approval.args) : null;
  const isPlanCard = isPlan && tree !== null;
  const keptCount = tree ? keptKeys(tree, off).length : 0;
  const totalCount = tree ? tree.length : 0;

  return React.createElement(
    "div",
    { className: CARD, "data-testid": "chat-approval-card", "data-status": state },
    heading(approval),
    target ? targetLine(target.title, target.workspaceName || target.workspaceId) : null,
    isPlanCard && tree
      ? planTreeBlock(tree, off, toggle, state !== "pending" || busy)
      : (approval ? argsBlock(approvalArgs(approval.args)) : null),
    isPlanCard && tree
      ? React.createElement("p", { className: "mb-1 text-[var(--osio-fg-muted)]" }, `${keptCount} of ${totalCount} will be created`)
      : null,
    previewWords(approval?.preview) ? previewLine(previewWords(approval?.preview)) : null,
    titles.length > 0 ? noteLine(`Asked from: ${titles.join(", ")}`) : null,
    approvedInRunWords(approval?.approvedInRun ?? 0)
      ? noteLine(approvedInRunWords(approval?.approvedInRun ?? 0))
      : null,
    approval ? noteLine(expiryWords(approval.expiresAt)) : null,
    busy
      ? stateLine("Writing…", true)
      : stateWords(state, error)
        ? stateLine(stateWords(state, error))
        : null,
    failure ? stateLine(failure) : null,
    !approval ? stateLine("The card of this request is loading…") : null,
    approval && state === "pending"
      ? actions(busy, decide, isPlanCard ? keptCount === 0 : false, isPlanCard && tree ? decisionItems(tree, off) : undefined)
      : state === "executed" && pageId
        ? openButton(pageId, onOpenPage)
        : null,
    state === "partial"
      ? React.createElement(
          "div",
          { className: "mt-2 flex items-center gap-2" },
          React.createElement(
            "button",
            {
              type: "button",
              className: BUTTON,
              disabled: busy,
              onClick: () => void resume(),
              "aria-label": "Resume",
            },
            "Resume",
          ),
        )
      : null,
  );
};

/** The heading of the card: the tool, in the words of the service. */
function heading(approval: ApprovalDescription | null): React.ReactElement {
  return React.createElement(
    "p",
    { className: "mb-1 flex items-center gap-1.5 font-semibold" },
    React.createElement(ShieldCheck, { size: 12, "aria-hidden": true, className: "text-[var(--osio-accent)]" }),
    approval?.verb || "The assistant asks for a write",
  );
}

/** The target of the write: the page, and the workspace it lands in. */
function targetLine(title: string, workspace: string): React.ReactElement {
  return React.createElement(
    "p",
    { className: "mb-1 text-[var(--osio-fg-muted)]" },
    title,
    workspace ? React.createElement("span", { className: "text-[var(--osio-fg-subtle)]" }, ` · ${workspace}`) : null,
  );
}

/** The arguments of the write: every one of them, verbatim. */
function argsBlock(args: { name: string; value: string }[]): React.ReactElement | null {
  if (args.length === 0) return null;
  return React.createElement(
    "dl",
    { className: "mb-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5" },
    ...args.flatMap((arg) => [
      React.createElement("dt", { key: `${arg.name}-name`, className: "text-[var(--osio-fg-subtle)]" }, arg.name),
      React.createElement(
        "dd",
        { key: `${arg.name}-value`, className: "break-words whitespace-pre-wrap font-mono text-[var(--osio-fg-default)]" },
        arg.value,
      ),
    ]),
  );
}

/** The scope of the write: how much it touches. */
function previewLine(text: string): React.ReactElement {
  return React.createElement("p", { className: "mb-1 text-[var(--osio-fg-muted)]" }, text);
}

/** A note of the card: where the request comes from, and when it closes. */
function noteLine(text: string): React.ReactElement | null {
  if (!text) return null;
  return React.createElement("p", { className: "text-[var(--osio-fg-subtle)]" }, text);
}

/** The state of the card, said out loud when it changes. */
function stateLine(text: string, spinning = false): React.ReactElement {
  return React.createElement(
    "p",
    { className: "mt-1 text-[var(--osio-fg-default)]", "aria-live": "polite", "data-testid": "approval-state" },
    spinning
      ? React.createElement(Loader2, {
          size: 12,
          className: "mr-1 inline animate-spin motion-reduce:animate-none",
          "aria-hidden": true,
        })
      : null,
    text,
  );
}

/**
 * The tree of a plan: an indented list of checkboxes. A node under a switched-off page is shown off and disabled;
 * once the approval is decided every box is frozen.
 */
function planTreeBlock(
  nodes: PlanNode[],
  off: Set<string>,
  onToggle: (key: string, currentlyOn: boolean) => void,
  frozen: boolean,
): React.ReactElement {
  const kept = new Set(keptKeys(nodes, off));
  const items = nodes.map((node) => {
    const checked = kept.has(node.key);
    return React.createElement(
      "li",
      { key: node.key, style: { paddingLeft: `${(node.depth - 1) * 16}px` } },
      React.createElement(
        "label",
        null,
        React.createElement("input", {
          type: "checkbox",
          checked,
          disabled: frozen || (!checked && !off.has(node.key)),
          onChange: () => onToggle(node.key, checked),
        }),
        " ",
        node.title,
        " ",
        React.createElement("span", { className: "text-[var(--osio-fg-subtle)]" }, node.kind),
      ),
    );
  });

  return React.createElement("ul", null, ...items);
}

/** The buttons of the card: the decision, and nothing else. */
function actions(
  busy: boolean,
  decide: (choice: ApprovalChoice, items?: string[]) => Promise<void>,
  approveDisabled = false,
  approveItems?: string[],
): React.ReactElement {
  return React.createElement(
    "div",
    { className: "mt-2 flex items-center gap-2" },
    React.createElement(
      "button",
      {
        type: "button",
        className: BUTTON,
        disabled: busy || approveDisabled,
        onClick: () => void decide("approve", approveItems),
        "aria-label": "Approve this write",
      },
      "Approve",
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: BUTTON,
        disabled: busy,
        onClick: () => void decide("decline"),
        "aria-label": "Decline this write",
      },
      "Decline",
    ),
  );
}

/** The link to the page the write touched. */
function openButton(pageId: string, onOpenPage?: (pageId: string) => void): React.ReactElement | null {
  if (!onOpenPage) return null;
  return React.createElement(
    "button",
    {
      type: "button",
      className: `${BUTTON} mt-1 text-[var(--osio-accent)] underline-offset-2 hover:underline`,
      onClick: () => onOpenPage(pageId),
      "aria-label": "Open the page",
    },
    "Open the page",
  );
}

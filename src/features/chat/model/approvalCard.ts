/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   approvalCard.ts                                    :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The card of a write: what it says, and what the user does with it.
 *
 * The card is the ONLY place the user sees what the assistant is about to
 * write. Three rules hold everywhere in this file:
 *
 * - EVERY ARGUMENT IS SHOWN, VERBATIM. The card is written as text nodes:
 *   an argument that holds `<img src=x onerror=…>` is shown, never run.
 * - THE CARD SAYS WHAT IT KNOWS. A target without a title, a page the
 *   message never cited: the card says nothing about it rather than
 *   something else.
 * - ONE CLICK, ONE POST. The guard of the in-flight decision is HERE, in the
 *   model, and not in the button: a double click, a click and an Enter, and
 *   two windows of the same conversation all reach this.
 */

import {
  decideApproval,
  fetchApproval,
  resumeApproval,
  ApprovalError,
  type ApprovalChoice,
  type ApprovalDecision,
  type ApprovalDescription,
  type ApprovalPreview,
  type ApprovalStatus,
} from "./approvals";

/** The state of a card: the status of the approval, or the unknown one. */
export type ApprovalCardState = ApprovalStatus;

/**
 * The state of a card, out of the status of the approval.
 *
 * A status the client does not know is the unknown one: the write MAY have
 * happened, and the card says so.
 */
export function approvalCardState(status: string): ApprovalCardState {
  if (
    status === "pending" ||
    status === "executing" ||
    status === "executed" ||
    status === "failed" ||
    status === "declined" ||
    status === "expired" ||
    status === "partial"
  ) {
    return status;
  }
  return "unknown";
}

/** "Asked by <name> · v<version>" — nothing when no agent asked (C304). */
export function askedByWords(agent: ApprovalDescription["agent"]): string {
  return agent ? `Asked by ${agent.name} · v${agent.version}` : "";
}

/**
 * The sentence of a state: what the card says when there is nothing to do.
 *
 * An executed write says what the service recorded — where the blocks went,
 * and the page version they made — and "Done" only when it recorded nothing.
 */
export function stateWords(state: ApprovalCardState, error?: string | null, summary?: string | null): string {
  if (state === "executing") return "Writing…";
  if (state === "executed") return summary || "Done";
  if (state === "declined") return "Declined";
  if (state === "expired") return "Expired — ask again";
  if (state === "unknown") return "May have been written — check the page";
  if (state === "failed") return error ? `The write failed: ${error}` : "The write failed.";
  if (state === "partial") return "Partly built — resume to finish";
  return "";
}

/** One argument of a write, as the card shows it: the name, and the value. */
export interface ApprovalArg {
  name: string;
  value: string;
}

/**
 * The arguments of a write, as they are shown.
 *
 * EVERY argument is there, in the order the service sent them, and the value
 * is the value: a string as it is, everything else as its JSON text.
 */
export function approvalArgs(args: Record<string, unknown> | undefined): ApprovalArg[] {
  if (!args) return [];
  return Object.entries(args).map(([name, value]) => ({ name, value: argumentText(value) }));
}

/**
 * The text of a value: the string itself, a list of text blocks one per line,
 * or the JSON of everything else.
 *
 * A list of blocks that are ONLY a type and a text — what add_blocks writes —
 * reads as `[type] text` lines: every character of it is still there, and
 * the reader sees the text instead of its escaped JSON.
 */
function argumentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isTextBlockList(value)) return value.map((block) => `[${block.type}] ${block.content}`).join("\n");
  if (value === undefined) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

/** A non-empty list whose every item is exactly `{ type, content }`, both strings. */
function isTextBlockList(value: unknown): value is { type: string; content: string }[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const keys = Object.keys(item);
    const { type, content } = item as { type?: unknown; content?: unknown };
    return keys.length === 2 && typeof type === "string" && typeof content === "string";
  });
}

/** The sentence of a write's result, when the service wrote one. */
export function resultSummary(result: unknown): string | null {
  const summary = (result as { summary?: unknown } | null)?.summary;
  return typeof summary === "string" && summary ? summary : null;
}

/** The preview of a write, in words: how much it touches. */
export function previewWords(preview: ApprovalPreview | undefined): string {
  const count = preview?.count ?? 0;
  if (preview?.unit === "blocks") return count === 1 ? "1 block" : `${count} blocks`;
  if (preview?.unit === "sub_pages") return count === 1 ? "1 sub-page" : `${count} sub-pages`;
  return "";
}

/**
 * The expiry of a card, in words: when the question closes itself.
 *
 * The clock is a parameter, so the words of a card do not depend on when
 * they are read.
 */
export function expiryWords(expiresAt: string, now: Date = new Date()): string {
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return "";
  const minutes = Math.round((at - now.getTime()) / 60_000);
  if (minutes <= 0) return "The question closed itself.";
  if (minutes === 1) return "The question closes itself in a minute.";
  return `The question closes itself in ${minutes} minutes.`;
}

/** The writes of a run that are already approved, in words. */
export function approvedInRunWords(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "1 write is already approved in this run.";
  return `${count} writes are already approved in this run.`;
}

/**
 * The pages a request comes from, by title — the ones the message knows.
 *
 * A page the message never cited has no title here: the card says what it
 * knows, and nothing more.
 */
export function provenanceTitles(
  pageIds: readonly string[] | undefined,
  known: readonly { pageId?: string; title: string }[],
): string[] {
  if (!pageIds || pageIds.length === 0) return [];
  const titles: string[] = [];
  for (const pageId of pageIds) {
    const title = known.find((page) => page.pageId === pageId)?.title ?? "";
    if (title && !titles.includes(title)) titles.push(title);
  }
  return titles;
}

/**
 * The line of an outside agent's write: who asked, and what osionos cannot see.
 *
 * The name is the one the user gave the token, and it is untrusted text: the
 * card shows it as a text node. The sentence says plainly that the agent's
 * reads are outside osionos, so the card never pretends to know them.
 */
export function externalAgentWords(name: string): string {
  return `Requested by external agent "${name}" — osionos cannot see what it read.`;
}

/**
 * "Influenced by: docs.example.org (web), fake (MCP)" — what outside content
 * shaped the request. Entries are `web:<domain>` or `mcp:<label>`; any other
 * shape is not shown, and a card with none says nothing. Text only: the label
 * of an MCP server and a domain come from third parties.
 */
export function influencedByWords(entries: readonly string[] | undefined): string {
  const named = (entries ?? []).flatMap((entry) => {
    const [kind, ...rest] = entry.split(":");
    const name = rest.join(":");
    if (!name) return [];
    if (kind === "web") return [`${name} (web)`];
    if (kind === "mcp") return [`${name} (MCP)`];
    return [];
  });
  return named.length > 0 ? `Influenced by: ${named.join(", ")}` : "";
}

/** The words of a refusal: the decision did not go through. */
export function refusalWords(code: string): string {
  if (code === "not_found") return "This request does not exist any more.";
  if (code === "rate_limited") return "Too many decisions at once — try again in a minute.";
  if (code === "unauthorized") return "The session is over — sign in again to decide.";
  if (code === "run_in_progress") return "The assistant is still working — try again in a moment.";
  return "The decision did not go through. Try again.";
}

/* -------------------------------------------------------------------------- */
/* The decision                                                                */
/* -------------------------------------------------------------------------- */

/** What a decision came to. */
export type ApprovalOutcome =
  /** The decision went through: the approval has a new status. */
  | {
      kind: "decided";
      status: ApprovalStatus;
      continuationRunId: string | null;
      error: string | null;
      summary: string | null;
    }
  /** A decision is already on its way: this one does nothing. */
  | { kind: "busy" }
  /** The approval was already decided: the card was fetched again. */
  | { kind: "conflict"; approval: ApprovalDescription }
  /** The decision did not go through. */
  | { kind: "failed"; code: string };

/** The approvals with a decision on its way: one click, one POST. */
const deciding = new Set<string>();

/**
 * A POST that decides the approval (the decision, or the resume of a partial
 * build), and what came of it.
 *
 * ONE CLICK, ONE POST: an approval whose POST is on its way refuses a second
 * one, whatever the buttons say. The guard lives here, in the model, and not
 * in the button — a double click, a click and an Enter, and two windows of
 * the same conversation all reach this.
 *
 * A 409 — the approval was already decided, or is not partial any more — is
 * NOT a failure: the card is fetched again, and it shows what really happened.
 */
async function guardedDecision(
  approvalId: string,
  post: () => Promise<ApprovalDecision>,
): Promise<ApprovalOutcome> {
  if (deciding.has(approvalId)) return { kind: "busy" };
  deciding.add(approvalId);
  try {
    const answer = await post();
    return {
      kind: "decided",
      status: answer.status,
      continuationRunId: answer.continuationRunId,
      error: answer.error ?? null,
      summary: resultSummary(answer.result),
    };
  } catch (error) {
    if (error instanceof ApprovalError && error.status === 409) {
      const approval = await fetchApproval(approvalId).catch(() => null);
      if (approval) return { kind: "conflict", approval };
    }
    const code = error instanceof ApprovalError ? error.code : "unknown";
    return { kind: "failed", code };
  } finally {
    deciding.delete(approvalId);
  }
}

/** The decision of the user; for a plan, `items` are the kept keys. */
export function decideApprovalCard(
  approvalId: string,
  decision: ApprovalChoice,
  items?: string[],
): Promise<ApprovalOutcome> {
  return guardedDecision(approvalId, () => decideApproval(approvalId, decision, items));
}

/** The resume of a partial approval: build the rest of it, under the same guard. */
export function resumeApprovalCard(approvalId: string): Promise<ApprovalOutcome> {
  return guardedDecision(approvalId, () => resumeApproval(approvalId));
}

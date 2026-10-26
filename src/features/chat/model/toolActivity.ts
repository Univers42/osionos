/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   toolActivity.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * What the assistant is doing — the calls it makes to its tools.
 *
 * A run is a loop: the model may call `search_workspace` (the passages of the
 * workspaces of the caller) or `read_page` (one page), and the run streams
 * `tool.called` (the call, with its arguments) and `tool.result` (the
 * outcome). The client ignored both, so the reader waited in silence while
 * the assistant searched.
 *
 * What is kept here is ONLY what the reader sees: the name of the tool, a
 * short label (the query of a search, the title of a page), where the call
 * stands, and how many passages it brought back. The result of a tool may
 * carry the text of a page: that text is never kept, never rendered.
 *
 * The count of a call comes from its sources. The service cites the pages a
 * tool found between the call and its outcome, one frame each, so the frames
 * that arrive in that window are the result of the call: a search counts its
 * passages, a read takes the title of the page it read.
 *
 * The queries and the titles are PLAIN TEXT: they are written as text nodes,
 * never as markup, never as markdown.
 *
 * Pure logic, no React: the line of a call lives in toolActivityLine.ts, and
 * the rendering in toolActivityView.ts.
 */

import type { ChatMessagePart } from "./chatTypes";

/** The tool that searches the workspaces of the caller. */
export const SEARCH_TOOL = "search_workspace";
/** The tool that reads one page. */
export const READ_TOOL = "read_page";
/** The tool that searches the web: only when the three web layers are on. */
export const WEB_SEARCH_TOOL = "web_search";
/** The tool that reads one web page. */
export const WEB_FETCH_TOOL = "web_fetch";
/** The tool that loads one skill of the agent. */
export const LOAD_SKILL_TOOL = "load_skill";

/** Where a call stands. */
export type ToolActivityStatus = "running" | "done" | "failed";

/** One call of the assistant, as the reader sees it. */
export interface ToolActivityPart {
  type: "tool-activity";
  /** The id of the call: its outcome answers it. */
  toolCallId: string;
  /** The name of the tool, as the model called it. */
  toolName: string;
  /** What the call is about: the query of a search, the title of a page. */
  label: string;
  /** Where the call stands. */
  status: ToolActivityStatus;
  /** How many passages the call brought back. */
  count?: number;
}

/** The characters of a label: a long query is cut, a title is short enough. */
const LABEL_CHARS = 120;

/**
 * The label of a call: the query of a search.
 *
 * The title of a page is not known yet when the model calls the read — the
 * title comes with the source the read found, and it is taken there.
 */
function toolLabel(toolName: string, input: unknown): string {
  // The id of a skill is the label: the client holds no list of skill names.
  if (toolName === LOAD_SKILL_TOOL) {
    const id = (input as { id?: unknown } | null)?.id;
    return typeof id === "string" ? id.trim().slice(0, LABEL_CHARS) : "";
  }
  if (toolName !== SEARCH_TOOL) return "";
  const query = (input as { query?: unknown } | null)?.query;
  if (typeof query !== "string") return "";
  const trimmed = query.trim();
  return trimmed.length > LABEL_CHARS ? `${trimmed.slice(0, LABEL_CHARS - 1)}…` : trimmed;
}

/* -------------------------------------------------------------------------- */
/* The parts of a message                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The parts of a message, with the call of a tool in them.
 *
 * A call is a new part, at the end: the parts of a message are the order the
 * reader saw them in.
 */
export function withToolCall(parts: ChatMessagePart[], data: Record<string, unknown>): ChatMessagePart[] {
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  const toolName = typeof data.toolName === "string" ? data.toolName : "";
  if (!toolCallId || !toolName) return parts;
  const call: ToolActivityPart = {
    type: "tool-activity",
    toolCallId,
    toolName,
    label: toolLabel(toolName, data.input),
    status: "running",
  };
  return [...parts, call];
}

/**
 * The parts of a message, with the outcome of a call in them.
 *
 * A result whose call was never seen is ignored: the frame belongs to a run
 * that started before the reader opened the conversation.
 */
export function withToolResult(parts: ChatMessagePart[], data: Record<string, unknown>): ChatMessagePart[] {
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  if (!toolCallId) return parts;
  const status: ToolActivityStatus = data.ok === true ? "done" : "failed";
  // What the call found, already-cited passages included: its citations alone
  // count only the new ones. An older service sends no count.
  const found = typeof data.found === "number" && Number.isInteger(data.found) && data.found >= 0 ? data.found : null;
  const index = parts.findIndex(
    (part) => part.type === "tool-activity" && part.toolCallId === toolCallId,
  );
  if (index === -1) return parts;
  return parts.map((part, position) => {
    if (position !== index || part.type !== "tool-activity") return part;
    return found === null ? { ...part, status } : { ...part, status, count: found };
  });
}

/** The position of the last call that matches, or -1. */
function lastActivity(parts: ChatMessagePart[], matches: (part: ToolActivityPart) => boolean): number {
  for (let cursor = parts.length - 1; cursor >= 0; cursor -= 1) {
    const part = parts[cursor];
    if (part.type === "tool-activity" && matches(part)) return cursor;
  }
  return -1;
}

/**
 * The parts of a message, with the source of a call in them.
 *
 * The sources a tool found are its result: the service cites them between the
 * call and its outcome, one frame each. A search counts its passages; a read
 * takes the title of the page it read.
 */
export function withToolSource(parts: ChatMessagePart[], data: Record<string, unknown>): ChatMessagePart[] {
  const title = typeof data.title === "string" ? data.title : "";
  // The call that found this source: the one the citation names. A citation
  // that names none (an older service) goes to the last running call.
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  let index = toolCallId ? lastActivity(parts, (part) => part.toolCallId === toolCallId) : -1;
  if (index === -1) index = lastActivity(parts, (part) => part.status === "running");
  if (index === -1) return parts;
  return parts.map((part, position) => {
    if (position !== index || part.type !== "tool-activity") return part;
    const label = part.toolName === READ_TOOL && !part.label ? title : part.label;
    return { ...part, count: (part.count ?? 0) + 1, label };
  });
}

/**
 * The calls of a message, in the order they were made.
 *
 * They are the parts of the message that are not the service's own.
 */
export function toolActivitiesFromParts(parts: ChatMessagePart[] | undefined): ToolActivityPart[] {
  if (!parts) return [];
  const activities: ToolActivityPart[] = [];
  for (const part of parts) {
    if (part.type !== "tool-activity") continue;
    activities.push(part);
  }
  return activities;
}

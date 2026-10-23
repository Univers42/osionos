/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   toolActivityLine.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The line of a call — what the reader reads while the assistant works.
 *
 * One line per call: what the assistant is doing, and what it did. A call
 * that runs says it is running; a call that is over says what it found; a
 * call that failed says it failed, and never says why — the internals of a
 * failure stay in the service.
 *
 * The label is a piece of its own: it is written as a text node, never as
 * markup — a query that holds `<img src=x onerror=alert(1)>` is shown, not
 * run.
 *
 * Pure logic, no React: the rendering lives in toolActivityView.ts.
 */

import { LOAD_SKILL_TOOL, READ_TOOL, SEARCH_TOOL, type ToolActivityPart } from "./toolActivity";

/** One piece of a line: plain text, or the label of the call. */
export type ToolLinePiece = { kind: "text"; text: string } | { kind: "label"; text: string };

/**
 * The line of a call, as the reader reads it.
 */
export function toolActivityLine(activity: ToolActivityPart): ToolLinePiece[] {
  const label = activity.label;
  if (activity.toolName === SEARCH_TOOL) {
    if (activity.status === "failed") return [{ kind: "text", text: "Couldn't search your workspace" }];
    if (activity.status === "running") {
      if (!label) return [{ kind: "text", text: "Searching your workspace…" }];
      return [
        { kind: "text", text: "Searching your workspace for " },
        { kind: "label", text: `“${label}”` },
        { kind: "text", text: "…" },
      ];
    }
    const count = activity.count ?? 0;
    const passages = count === 0 ? "no passages" : count === 1 ? "1 passage" : `${count} passages`;
    return [{ kind: "text", text: `Searched your workspace — ${passages}` }];
  }
  if (activity.toolName === READ_TOOL) {
    if (activity.status === "failed") return [{ kind: "text", text: "Couldn't read that page" }];
    if (activity.status === "running") {
      if (!label) return [{ kind: "text", text: "Reading the page…" }];
      return [
        { kind: "text", text: "Reading " },
        { kind: "label", text: label },
        { kind: "text", text: "…" },
      ];
    }
    return label
      ? [
          { kind: "text", text: "Read " },
          { kind: "label", text: label },
        ]
      : [{ kind: "text", text: "Read the page" }];
  }
  if (activity.toolName === LOAD_SKILL_TOOL) {
    if (activity.status === "failed") return [{ kind: "text", text: "Couldn't load that skill" }];
    const verb = activity.status === "running" ? "Loading skill: " : "Loaded skill: ";
    return label
      ? [
          { kind: "text", text: verb },
          { kind: "label", text: label },
        ]
      : [{ kind: "text", text: activity.status === "running" ? "Loading a skill…" : "Loaded a skill" }];
  }
  // A tool the client does not know: the reader gets a line, and nothing else.
  if (activity.status === "failed") return [{ kind: "text", text: "Couldn't do that" }];
  if (activity.status === "done") return [{ kind: "text", text: "Done" }];
  return [{ kind: "text", text: "Working…" }];
}

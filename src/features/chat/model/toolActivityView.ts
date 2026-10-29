/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   toolActivityView.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The calls of the assistant, above its answer.
 *
 * One compact step per call, on a timeline: the icon of the tool, then what
 * the assistant is doing, and what it did. The steps fold when there are many
 * of them — the last one is shown, and a button unfolds the rest. The button
 * is a real button: it is reachable with the keyboard, and it says whether
 * the list is open.
 *
 * A call that runs is lit in the accent and its icon pulses, honouring the
 * "reduce motion" of the reader; a call that failed takes the danger tint.
 *
 * The text of a line is written as TEXT NODES: a query that holds markup is
 * shown, never run.
 */

import React, { useState } from "react";
import { BookOpen, FileText, Globe, Link2, Search, Wrench, type LucideIcon } from "lucide-react";

import { toolActivityLine } from "./toolActivityLine";
import {
  LOAD_SKILL_TOOL,
  READ_TOOL,
  SEARCH_TOOL,
  WEB_FETCH_TOOL,
  WEB_SEARCH_TOOL,
  type ToolActivityPart,
} from "./toolActivity";

/** The lines the reader sees before the list folds to the last one. */
const VISIBLE_LINES = 3;

/** The icon of each known tool; an unknown one gets the generic wrench. */
const TOOL_ICONS: Record<string, LucideIcon> = {
  [SEARCH_TOOL]: Search,
  [READ_TOOL]: FileText,
  [WEB_SEARCH_TOOL]: Globe,
  [WEB_FETCH_TOOL]: Link2,
  [LOAD_SKILL_TOOL]: BookOpen,
};

const BUBBLE_TONE: Record<ToolActivityPart["status"], string> = {
  running:
    "border-[var(--osio-accent)] bg-[var(--osio-bg-surface)] text-[var(--osio-accent)] animate-pulse motion-reduce:animate-none",
  done: "border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]",
  failed: "border-[var(--osio-danger)] bg-[var(--osio-bg-surface)] text-[var(--osio-danger)]",
};

/** The calls of the assistant, as the reader reads them. */
export function ToolActivity(props: { activities: ToolActivityPart[] }): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const activities = props.activities;
  if (activities.length === 0) return null;
  const folded = activities.length > VISIBLE_LINES && !expanded;
  const shown = folded ? activities.slice(-1) : activities;
  return React.createElement(
    "div",
    { className: "mb-2 text-xs text-[var(--osio-fg-muted)]", "data-testid": "chat-tool-activity" },
    React.createElement(
      "ul",
      { className: "relative m-0 list-none p-0" },
      shown.length > 1
        ? React.createElement("span", {
            "aria-hidden": true,
            className: "absolute bottom-3 left-[9.5px] top-3 w-px bg-[var(--osio-border-default)]",
          })
        : null,
      ...shown.map((activity) => activityLine(activity)),
    ),
    activities.length > VISIBLE_LINES
      ? foldButton(expanded, activities.length, setExpanded)
      : null,
  );
}

/** One call, as a step: the icon of its tool, then its text. */
function activityLine(activity: ToolActivityPart): React.ReactElement {
  return React.createElement(
    "li",
    {
      key: activity.toolCallId,
      className: "relative flex items-start gap-2 pb-1.5 last:pb-0",
      "data-status": activity.status,
    },
    toolBubble(activity),
    React.createElement(
      "span",
      { className: "min-w-0 pt-0.5" },
      ...toolActivityLine(activity).map((piece, index) =>
        piece.kind === "label"
          ? React.createElement(
              "span",
              { key: index, className: "text-[var(--osio-fg-default)]" },
              piece.text,
            )
          : piece.text,
      ),
    ),
  );
}

/** The round icon of a step: the tool it called, in the tone of where the call stands. */
function toolBubble(activity: ToolActivityPart): React.ReactElement {
  const Icon = TOOL_ICONS[activity.toolName] ?? Wrench;
  return React.createElement(
    "span",
    {
      "aria-hidden": true,
      "data-tool-icon": activity.toolName in TOOL_ICONS ? activity.toolName : "generic",
      className: `relative z-[1] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${BUBBLE_TONE[activity.status]}`,
    },
    React.createElement(Icon, { size: 11, strokeWidth: 2.25 }),
  );
}

/** The button that unfolds the calls: it says how many of them there are. */
function foldButton(
  expanded: boolean,
  count: number,
  setExpanded: (value: boolean) => void,
): React.ReactElement {
  return React.createElement(
    "button",
    {
      type: "button",
      "aria-expanded": expanded,
      onClick: () => setExpanded(!expanded),
      className:
        "cursor-pointer text-left text-[var(--osio-fg-muted)] underline-offset-2 hover:text-[var(--osio-fg-default)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]",
    },
    expanded ? "Hide the steps" : `Show the ${count} steps`,
  );
}

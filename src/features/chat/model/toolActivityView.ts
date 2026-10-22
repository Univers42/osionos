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
 * One compact line per call: what the assistant is doing, and what it did.
 * The lines fold when there are many of them — the last one is shown, and a
 * button unfolds the rest. The button is a real button: it is reachable with
 * the keyboard, and it says whether the list is open.
 *
 * A call that runs pulses: the dot is a progress indicator, and it honours
 * the "reduce motion" of the reader.
 *
 * The text of a line is written as TEXT NODES: a query that holds markup is
 * shown, never run.
 */

import React, { useState } from "react";

import { toolActivityLine } from "./toolActivityLine";
import type { ToolActivityPart } from "./toolActivity";

/** The lines the reader sees before the list folds to the last one. */
const VISIBLE_LINES = 3;

/** The calls of the assistant, as the reader reads them. */
export function ToolActivity(props: { activities: ToolActivityPart[] }): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const activities = props.activities;
  if (activities.length === 0) return null;
  const folded = activities.length > VISIBLE_LINES && !expanded;
  const shown = folded ? activities.slice(-1) : activities;
  return React.createElement(
    "div",
    { className: "mb-1 text-xs text-[var(--osio-fg-muted)]", "data-testid": "chat-tool-activity" },
    React.createElement(
      "ul",
      { className: "m-0 list-none space-y-0.5 p-0" },
      ...shown.map((activity) => activityLine(activity)),
    ),
    activities.length > VISIBLE_LINES
      ? foldButton(expanded, activities.length, setExpanded)
      : null,
  );
}

/** One call, as a line: its text, and the dot of a call that runs. */
function activityLine(activity: ToolActivityPart): React.ReactElement {
  return React.createElement(
    "li",
    {
      key: activity.toolCallId,
      className: "flex items-start gap-1.5",
      "data-status": activity.status,
    },
    activity.status === "running" ? progressDot() : null,
    React.createElement(
      "span",
      null,
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

/** The dot of a call that runs: it pulses, unless the reader asked for no motion. */
function progressDot(): React.ReactElement {
  return React.createElement("span", {
    "aria-hidden": true,
    className:
      "mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--osio-accent)] motion-reduce:animate-none",
  });
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

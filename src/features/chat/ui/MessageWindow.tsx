/**
 * The window over a long thread: the last 60 messages, and a button that
 * reveals 60 more per click.
 *
 * No JSX: the canvas suite renders it under node.
 */

import React, { useState } from "react";

import { windowStart } from "../model/messageWindow";

export function MessageWindow<T>({
  items,
  initialPages = 0,
  children,
}: {
  items: readonly T[];
  /** Pages already revealed (tests; the thread starts at 0). */
  initialPages?: number;
  children: (visible: readonly T[], offset: number) => React.ReactNode;
}): React.ReactElement {
  const [pages, setPages] = useState(initialPages);
  const start = windowStart(items.length, pages);
  return React.createElement(
    React.Fragment,
    null,
    start > 0
      ? React.createElement(
          "button",
          {
            type: "button",
            className: "mx-auto cursor-pointer rounded-md px-3 py-1 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]",
            onClick: () => setPages((count) => count + 1),
          },
          "Show earlier messages",
        )
      : null,
    children(items.slice(start), start),
  );
}

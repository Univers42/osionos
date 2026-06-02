/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RawCodePane.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useRef, useState } from "react";

interface RawCodePaneProps {
  initialSource: string;
  onChange: (next: string) => void;
  showLineNumbers: boolean;
}

function countLines(text: string): number {
  return text.length === 0 ? 1 : text.split("\n").length;
}

/**
 * Monospace raw-markdown editor with an optional, scroll-synced line gutter.
 *
 * The textarea is *uncontrolled* (`defaultValue`): keystrokes are handled
 * natively by the browser and never round-trip through React, so typing stays
 * instant regardless of document size. `onChange` reports the value to the
 * (debounced) preview/save owner. Only the line count is tracked in state, and
 * only updated when it actually changes — so most keystrokes cause no render.
 */
function RawCodePaneImpl({ initialSource, onChange, showLineNumbers }: Readonly<RawCodePaneProps>) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [lineCount, setLineCount] = useState(() => countLines(initialSource));

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    onChange(next);
    const lines = countLines(next);
    setLineCount((previous) => (previous === lines ? previous : lines));
  };

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const gutterNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, index) => <div key={index}>{index + 1}</div>),
    [lineCount],
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[var(--osio-bg-surface)] font-mono text-[13px] leading-6">
      {showLineNumbers && (
        <div ref={gutterRef} aria-hidden className="select-none overflow-hidden border-r border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-3 text-right text-[var(--osio-fg-subtle)]">
          {gutterNumbers}
        </div>
      )}
      <textarea
        ref={textareaRef}
        defaultValue={initialSource}
        spellCheck={false}
        onChange={handleChange}
        onScroll={syncScroll}
        aria-label="Raw markdown source"
        className="h-full min-h-0 flex-1 resize-none whitespace-pre bg-transparent px-3 py-3 text-[var(--osio-fg-default)] outline-none"
      />
    </div>
  );
}

export const RawCodePane = React.memo(RawCodePaneImpl);

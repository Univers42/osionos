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

import React, { useRef } from "react";

interface RawCodePaneProps {
  source: string;
  onChange: (next: string) => void;
  showLineNumbers: boolean;
}

/** Monospace raw-markdown editor with an optional, scroll-synced line gutter. */
export function RawCodePane({ source, onChange, showLineNumbers }: Readonly<RawCodePaneProps>) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const lineCount = source.length === 0 ? 1 : source.split("\n").length;

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[var(--osio-bg-surface)] font-mono text-[13px] leading-6">
      {showLineNumbers && (
        <div ref={gutterRef} aria-hidden className="select-none overflow-hidden border-r border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-3 text-right text-[var(--osio-fg-subtle)]">
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={source}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        aria-label="Raw markdown source"
        className="h-full min-h-0 flex-1 resize-none whitespace-pre bg-transparent px-3 py-3 text-[var(--osio-fg-default)] outline-none"
      />
    </div>
  );
}

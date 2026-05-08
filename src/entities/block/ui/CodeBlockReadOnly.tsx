/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CodeBlockReadOnly.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Check, Copy } from "lucide-react";
import type { Block } from "@/entities/block";
import { MermaidDiagram, CodeSyntaxHighlight } from "@/shared/ui";

export const CodeBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const [copied, setCopied] = React.useState(false);
  const lang = block.language || "plaintext";
  const isMermaid = lang.trim().toLowerCase() === "mermaid";

  const handleCopy = React.useCallback(() => {
    navigator.clipboard.writeText(block.content).then(() => {
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1200);
    }).catch(() => undefined);
  }, [block.content]);

  return (
    <div className="my-2 overflow-hidden rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-1.5">
        <span className="text-xs font-mono text-[var(--osio-fg-muted)]">
          {lang}
        </span>
        <button
          type="button"
          title="Copy code"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
          onClick={handleCopy}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      {isMermaid ? (
        <MermaidDiagram
          chart={block.content}
          className="overflow-x-auto bg-[var(--osio-bg-surface)] p-3"
        />
      ) : (
        <CodeSyntaxHighlight
          code={block.content}
          language={lang}
          className="overflow-x-auto bg-[var(--osio-bg-surface)] p-3"
          codeClassName="font-mono text-sm leading-6 whitespace-pre"
        />
      )}
    </div>
  );
};

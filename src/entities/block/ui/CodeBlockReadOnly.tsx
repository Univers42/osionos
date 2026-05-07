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
import type { Block } from "@/entities/block";
import { MermaidDiagram, CodeSyntaxHighlight } from "@/shared/ui";

export const CodeBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const lang = block.language || "plaintext";
  const isMermaid = lang.trim().toLowerCase() === "mermaid";

  return (
    <div className="my-1 rounded-lg overflow-hidden border border-[var(--osio-border-default)]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--osio-bg-subtle)] border-b border-[var(--osio-border-default)]">
        <span className="text-xs font-mono text-[var(--osio-fg-muted)]">
          {lang}
        </span>
      </div>
      {isMermaid ? (
        <MermaidDiagram
          chart={block.content}
          className="p-3 bg-[var(--osio-bg-surface)] overflow-x-auto"
        />
      ) : (
        <CodeSyntaxHighlight
          code={block.content}
          language={lang}
          className="p-3 bg-[var(--osio-bg-surface)] overflow-x-auto"
          codeClassName="text-sm leading-relaxed font-mono whitespace-pre"
        />
      )}
    </div>
  );
};

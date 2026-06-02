/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CodeBlockReadOnly.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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
    <div className="osio-code-card my-3 overflow-hidden rounded-xl border border-[var(--osio-code-border)] bg-[var(--osio-code-bg)] shadow-[var(--osio-code-shadow)] ring-1 ring-inset ring-[var(--osio-code-ring)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-3 py-2">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </span>
          <span className="rounded-md border border-[var(--osio-code-border)] bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-[var(--osio-code-fg-muted)]">
            {lang}
          </span>
        </div>
        <button
          type="button"
          title="Copy code"
          className={[
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors hover:bg-white/[0.1]",
            copied ? "text-[#3fb950]" : "text-[var(--osio-code-fg-muted)] hover:text-[var(--osio-code-fg)]",
          ].join(" ")}
          onClick={handleCopy}
        >
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
        </button>
      </div>
      {isMermaid ? (
        <MermaidDiagram
          chart={block.content}
          className="overflow-x-auto bg-white p-4"
        />
      ) : (
        <CodeSyntaxHighlight
          code={block.content}
          language={lang}
          className="overflow-x-auto p-4"
          codeClassName="font-mono text-sm leading-6 whitespace-pre"
        />
      )}
    </div>
  );
};

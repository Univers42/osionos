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
import { useBaseTheme } from "@/shared/config/useBaseTheme";
import { CodeGutter } from "./CodeGutter";

export const CodeBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const [copied, setCopied] = React.useState(false);
  const baseTheme = useBaseTheme();
  const lang = block.language || "plaintext";
  const isMermaid = lang.trim().toLowerCase() === "mermaid";
  const showLineNumbers = Boolean(block.lineNumbers);
  const lineCount = Math.max(1, (block.content || "").split("\n").length);

  const handleCopy = React.useCallback(() => {
    navigator.clipboard.writeText(block.content).then(() => {
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1200);
    }).catch(() => undefined);
  }, [block.content]);

  return (
    <div
      data-code-theme={block.codeTheme ?? "app"}
      className="osio-code-card osio-code-block my-3 overflow-hidden rounded-[var(--osio-radius-lg)] bg-[var(--osio-code-bg)]"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-1.5">
        <span className="shrink-0 text-xs text-[var(--osio-code-fg-muted)]">
          {lang}
        </span>
        {block.fileName ? (
          <span className="min-w-0 flex-1 truncate font-mono text-2xs text-[var(--osio-code-fg-muted)]">
            {block.fileName}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          title="Copy code"
          className={[
            "osio-code-quiet inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-2xs font-medium transition-colors hover:bg-[var(--osio-code-btn-hover)]",
            copied ? "text-[var(--osio-success)]" : "text-[var(--osio-code-fg-muted)] hover:text-[var(--osio-code-fg)]",
          ].join(" ")}
          onClick={handleCopy}
        >
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      {isMermaid ? (
        <div data-osio-fixed-scale>
          <MermaidDiagram chart={block.content} codeTheme={block.codeTheme ?? baseTheme} />
        </div>
      ) : (
        <div className="flex">
          {showLineNumbers && (
            <CodeGutter
              lineCount={lineCount}
              className="shrink-0 pl-4"
            />
          )}
          <CodeSyntaxHighlight
            code={block.content}
            language={lang}
            className="min-w-0 grow overflow-x-auto px-4 pt-2 pb-5"
            codeClassName="font-mono text-sm leading-6 whitespace-pre"
          />
        </div>
      )}
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EquationView.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: serjimen <djsurgeon83@gmail.com>           +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/29 17:50:00 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Check, Copy } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import { getLoadedKatex, loadKatex, onKatexReady, renderMathToHtml } from "@/shared/lib/math/katexRuntime";
import {
  copyTextToClipboard,
  formatEquationAriaLabel,
  sanitizeEquationSource,
} from "./equationUtils";

export interface EquationViewProps {
  source: string;
  displayMode?: boolean;
  showCopy?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a LaTeX equation, lazily loading katex on first use. Until katex is
 * ready it shows the raw source so the block is never blank, then upgrades to
 * the typeset output. Keeps katex out of the editor's initial chunk.
 */
export function EquationView({
  source,
  displayMode = true,
  showCopy = true,
  className,
  style,
}: EquationViewProps) {
  const [, setReady] = useState(() => Boolean(getLoadedKatex()));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (getLoadedKatex()) return;
    const unsubscribe = onKatexReady(() => setReady(true));
    void loadKatex();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const sanitized = sanitizeEquationSource(source);
  const ariaLabel = formatEquationAriaLabel(source, displayMode);
  const html = renderMathToHtml(sanitized, displayMode);

  const handleCopy = async () => {
    if (!sanitized) return;
    const success = await copyTextToClipboard(sanitized);
    if (success) {
      setCopied(true);
    }
  };

  const copyButton =
    showCopy && sanitized ? (
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy LaTeX equation"
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1 text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
      >
        {copied ? (
          <Check size={12} className="text-[var(--osio-accent-text)]" />
        ) : (
          <Copy size={12} />
        )}
      </button>
    ) : null;

  const wrapperClass = ["group relative", className].filter(Boolean).join(" ");

  if (html === null) {
    return (
      <div
        role="math"
        aria-label={ariaLabel}
        aria-roledescription="math equation"
        className={wrapperClass}
        style={style}
      >
        <div>{source || (displayMode ? "E = mc^2" : "")}</div>
        {copyButton}
      </div>
    );
  }

  return (
    <div
      role="math"
      aria-label={ariaLabel}
      aria-roledescription="math equation"
      className={wrapperClass}
      style={style}
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {copyButton}
    </div>
  );
}

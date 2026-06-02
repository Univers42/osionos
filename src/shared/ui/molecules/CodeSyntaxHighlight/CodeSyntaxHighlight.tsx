/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CodeSyntaxHighlight.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:26:26 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { escapeHtml, loadHighlighterFor, normalizeLanguage, type Highlighter } from "./highlighter";

interface CodeSyntaxHighlightProps {
  code: string;
  language?: string;
  className?: string;
  codeClassName?: string;
  style?: React.CSSProperties;
}

export const CodeSyntaxHighlight: React.FC<CodeSyntaxHighlightProps> = ({
  code,
  language,
  className,
  codeClassName,
  style,
}) => {
  const hljsRef = useRef<Highlighter | null>(null);
  const [ready, setReady] = useState(0);
  const normalized = normalizeLanguage(language);

  useEffect(() => {
    if (!normalized) return;
    let active = true;
    loadHighlighterFor(normalized).then((instance) => {
      hljsRef.current = instance;
      // The hljs singleton ref is stable, so bump a version to re-highlight
      // once the language grammar has registered.
      if (active) setReady((value) => value + 1);
    });
    return () => {
      active = false;
    };
  }, [normalized]);

  const highlighted = useMemo(() => {
    const hljs = hljsRef.current;
    if (!normalized || !hljs?.getLanguage(normalized)) return escapeHtml(code);

    try {
      return hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(code);
    }
    // `ready` bumps when the grammar finishes loading -> recompute the highlight.
  }, [ready, code, normalized]);

  return (
    <pre className={className} style={style}>
      <code
        className={["hljs", normalized ? `language-${normalized}` : "", codeClassName ?? ""]
          .filter(Boolean)
          .join(" ")}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
};

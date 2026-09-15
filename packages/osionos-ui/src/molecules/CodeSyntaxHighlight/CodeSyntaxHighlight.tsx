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

import React, { useEffect, useMemo, useState } from "react";

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
  // State (not a ref): the memo below reads it during render, and render-time
  // ref reads are invisible to React — state makes the post-load re-highlight
  // an ordinary update (no version counter needed).
  const [hljs, setHljs] = useState<Highlighter | null>(null);
  const normalized = normalizeLanguage(language);

  useEffect(() => {
    if (!normalized) return;
    let active = true;
    loadHighlighterFor(normalized).then((instance) => {
      if (active) setHljs(instance);
    });
    return () => {
      active = false;
    };
  }, [normalized]);

  const highlighted = useMemo(() => {
    if (!normalized || !hljs?.getLanguage(normalized)) return escapeHtml(code);

    try {
      return hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(code);
    }
  }, [hljs, code, normalized]);

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

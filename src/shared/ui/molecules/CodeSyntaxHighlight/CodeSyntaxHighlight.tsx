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

import { escapeHtml, loadHighlighter, normalizeLanguage, type Highlighter } from "./highlighter";

interface CodeSyntaxHighlightProps {
  code: string;
  language?: string;
  className?: string;
  codeClassName?: string;
}

export const CodeSyntaxHighlight: React.FC<CodeSyntaxHighlightProps> = ({
  code,
  language,
  className,
  codeClassName,
}) => {
  const [hljs, setHljs] = useState<Highlighter | null>(null);
  const normalized = normalizeLanguage(language);

  useEffect(() => {
    if (!normalized) return;
    let active = true;
    loadHighlighter().then((instance) => {
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
    <pre className={className}>
      <code
        className={["hljs", normalized ? `language-${normalized}` : "", codeClassName ?? ""]
          .filter(Boolean)
          .join(" ")}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
};

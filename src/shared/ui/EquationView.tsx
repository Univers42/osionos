/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EquationView.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState, type CSSProperties } from "react";

import { getLoadedKatex, loadKatex, onKatexReady, renderMathToHtml } from "@/shared/lib/math/katexRuntime";

interface EquationViewProps {
  source: string;
  displayMode?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a LaTeX equation, lazily loading katex on first use. Until katex is
 * ready it shows the raw source so the block is never blank, then upgrades to
 * the typeset output. Keeps katex out of the editor's initial chunk.
 */
export function EquationView({ source, displayMode = true, className, style }: EquationViewProps) {
  const [, setReady] = useState(() => Boolean(getLoadedKatex()));

  useEffect(() => {
    if (getLoadedKatex()) return;
    const unsubscribe = onKatexReady(() => setReady(true));
    void loadKatex();
    return unsubscribe;
  }, []);

  const html = renderMathToHtml(source, displayMode);
  if (html === null) {
    return (
      <div className={className} style={style}>
        {source || (displayMode ? "E = mc^2" : "")}
      </div>
    );
  }

  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

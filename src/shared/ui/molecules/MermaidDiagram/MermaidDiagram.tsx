/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MermaidDiagram.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:26:44 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:26:45 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";
import mermaid from "mermaid";

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

let mermaidInitialized = false;

function ensureMermaidInitialized() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "default",
  });
  mermaidInitialized = true;
}

function nextRenderId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `osionos-mermaid-${crypto.randomUUID()}`;
  }
  return `osionos-mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  chart,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTokenRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const source = chart.trim();
    if (!source) {
      container.innerHTML = "";
      return;
    }

    const currentToken = ++renderTokenRef.current;
    let cancelled = false;

    container.innerHTML = "";

    void (async () => {
      try {
        ensureMermaidInitialized();
        const renderId = nextRenderId();
        const { svg, bindFunctions } = await mermaid.render(renderId, source);

        if (cancelled || renderTokenRef.current !== currentToken) return;
        container.innerHTML = svg;
        bindFunctions?.(container);
      } catch {
        if (cancelled || renderTokenRef.current !== currentToken) return;
        container.innerHTML = "";

        const fallback = document.createElement("pre");
        fallback.className =
          "text-[12px] leading-relaxed font-mono text-red-600 whitespace-pre-wrap";
        fallback.textContent = source;
        container.appendChild(fallback);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="mermaid-diagram [&_svg]:max-w-full [&_svg]:h-auto"
      />
    </div>
  );
};

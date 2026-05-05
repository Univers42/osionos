/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MermaidDiagram.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:26:44 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/05 15:08:41 by dlesieur         ###   ########.fr       */
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
  return `osionos-mermaid-${Date.now().toString(36)}`;
}

/**
 * Remove any orphaned SVG or iframe that mermaid.render() may have
 * injected into document.body before throwing a parse error.
 */
function cleanupMermaidOrphans(renderId: string) {
  const orphan = document.getElementById(renderId);
  if (orphan && !orphan.closest(".mermaid-diagram")) {
    orphan.remove();
  }
  // Mermaid may also leave a sibling container with id `d${renderId}`
  const dOrphan = document.getElementById(`d${renderId}`);
  if (dOrphan && !dOrphan.closest(".mermaid-diagram")) {
    dOrphan.remove();
  }
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  chart,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTokenRef = useRef(0);
  const lastRenderIdRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const target = container;

    const source = chart.trim();
    if (!source) {
      target.innerHTML = "";
      return;
    }

    const currentToken = ++renderTokenRef.current;
    let cancelled = false;
    const renderId = nextRenderId();
    lastRenderIdRef.current = renderId;

    target.innerHTML = "";

    async function renderDiagram() {
      try {
        ensureMermaidInitialized();
        const { svg, bindFunctions } = await mermaid.render(renderId, source);

        if (cancelled || renderTokenRef.current !== currentToken) {
          cleanupMermaidOrphans(renderId);
          return;
        }

        target.innerHTML = svg;
        bindFunctions?.(target);
      } catch {
        // Clean up any SVG/iframe that mermaid injected before the error.
        cleanupMermaidOrphans(renderId);

        if (cancelled || renderTokenRef.current !== currentToken) return;

        target.innerHTML = "";
        const fallback = document.createElement("pre");
        fallback.className =
          "text-[12px] leading-relaxed font-mono text-red-600 whitespace-pre-wrap";
        fallback.textContent = source;
        target.appendChild(fallback);
      }
    }

    renderDiagram().catch((error: unknown) => {
      console.error("[MermaidDiagram] Failed to render diagram", error);
    });

    return () => {
      cancelled = true;
      // Clean up on unmount or re-render to prevent orphaned nodes
      // persisting across page navigations.
      if (lastRenderIdRef.current) {
        cleanupMermaidOrphans(lastRenderIdRef.current);
      }
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

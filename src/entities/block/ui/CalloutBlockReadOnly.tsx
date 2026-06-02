/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CalloutBlockReadOnly.tsx                           :+:      :+:    :+:   */
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
/*   CalloutBlockReadOnly.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Block } from '@/entities/block';
import { CALLOUT_COLORS } from "@/entities/block";
import { getToggleHeadingClass } from "@/entities/block/model/toggleHeading";
import { parseInlineMarkdown } from '@/shared/lib/markengine';
import { resolveInternalPageLinkTitle } from "@/entities/page/model/resolveInternalPageLinkTitle";
import { ReadOnlyBlock } from "./ReadOnlyBlock";

export const CalloutBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const [expanded, setExpanded] = useState(!block.collapsed);
  const icon = block.color || "💡";
  const colors = CALLOUT_COLORS[icon] || {
    bg: "bg-[var(--osio-bg-subtle)]",
    border: "border-[var(--osio-border-default)]",
    text: "text-[var(--osio-fg-default)]",
  };
  const content = block.content
    ? {
        __html: parseInlineMarkdown(block.content, {
          resolveInternalLinkTitle: resolveInternalPageLinkTitle,
        }),
      }
    : null;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border my-0.5 ${colors.bg} ${colors.border}`}
    >
      {block.children?.length ? (
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
        >
          <ChevronRight size={14} className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
        </button>
      ) : null}
      <span className={`text-lg shrink-0 ${colors.text}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <span
          className={`${getToggleHeadingClass(block.headingLevel)} ${colors.text} leading-relaxed py-0.5`}
          dangerouslySetInnerHTML={content ?? undefined}
        />
        {expanded && block.children?.length ? (
          <div className="mt-1">
            {block.children.map((child, index) => (
              <ReadOnlyBlock key={child.id} block={child} index={index} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

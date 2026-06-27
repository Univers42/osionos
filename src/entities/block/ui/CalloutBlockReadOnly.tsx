/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CalloutBlockReadOnly.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Block } from "@/entities/block";
import { calloutAccent, calloutDisplayIcon, calloutSurface, resolveCalloutType } from "@/entities/block";
import { getToggleHeadingClass } from "@/entities/block/model/toggleHeading";
import { IconValueView } from "@/shared/ui";
import { parseInlineMarkdown } from "@/shared/lib/markengine";
import { resolveInternalPageLinkTitle } from "@/entities/page/model/resolveInternalPageLinkTitle";
import { ReadOnlyBlock } from "./ReadOnlyBlock";

/**
 * A callout = a tagged container. The tint (resolved from its semantic type) colors the
 * SURFACE + border + icon only — body text stays default for contrast — and child blocks sit
 * in an accent-railed inset so the "everything nests here" affordance reads at a glance.
 */
export const CalloutBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const [expanded, setExpanded] = useState(!block.collapsed);
  const type = resolveCalloutType(block.color);
  const icon = calloutDisplayIcon(block.color);
  const accent = calloutAccent(type);
  const hasChildren = Boolean(block.children?.length);
  const content = block.content
    ? { __html: parseInlineMarkdown(block.content, { resolveInternalLinkTitle: resolveInternalPageLinkTitle }) }
    : null;

  return (
    <div
      role="note"
      aria-label={`${type.label} callout`}
      className="flex items-start gap-3 my-0.5 rounded-lg border-l-[3px] py-3 pl-4 pr-4"
      style={calloutSurface(type)}
    >
      {hasChildren ? (
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-[var(--osio-bg-hover)]"
          style={{ color: accent }}
        >
          <ChevronRight size={14} className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
        </button>
      ) : null}
      <IconValueView value={icon} size={20} className="shrink-0 leading-none" />
      <div className="min-w-0 flex-1">
        <span
          className={`${getToggleHeadingClass(block.headingLevel)} py-0.5 leading-relaxed text-[var(--osio-fg-default)]`}
          dangerouslySetInnerHTML={content ?? undefined}
        />
        {expanded && hasChildren ? (
          <div className="mt-1 border-l-2 pl-3" style={{ borderColor: accent }}>
            {block.children?.map((child, index) => (
              <ReadOnlyBlock key={child.id} block={child} index={index} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

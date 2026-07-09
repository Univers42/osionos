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

import React from "react";
import type { Block } from "@/entities/block";
import { calloutDisplayIcon, calloutSurface, resolveCalloutType } from "@/entities/block";
import { getToggleHeadingClass } from "@/entities/block/model/toggleHeading";
import { IconValueView } from "@/shared/ui";
import { parseInlineMarkdown } from "@/shared/lib/markengine";
import { resolveInternalPageLinkTitle } from "@/entities/page/model/resolveInternalPageLinkTitle";
import { ReadOnlyBlock } from "./ReadOnlyBlock";

/**
 * A callout = a flat tinted surface (Notion pattern): no border, no rail, never collapsible.
 * The tint colors SURFACE + icon only — body text stays default for contrast — and children
 * render flush with the title text. Collapsing belongs to the `toggle` block; the vertical
 * bar belongs to a nested quote/citation child, which draws its own. `collapsed` is ignored
 * here on purpose so legacy-collapsed callouts never hide content without an affordance.
 */
export const CalloutBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const type = resolveCalloutType(block.color);
  const icon = calloutDisplayIcon(block.color);
  const hasChildren = Boolean(block.children?.length);
  const content = block.content
    ? { __html: parseInlineMarkdown(block.content, { resolveInternalLinkTitle: resolveInternalPageLinkTitle }) }
    : null;

  return (
    <div
      role="note"
      aria-label={`${type.label} callout`}
      className="my-1 flex items-start gap-3 rounded-lg px-4 py-3"
      style={calloutSurface(type)}
    >
      <IconValueView value={icon} size={20} className="mt-0.5 shrink-0 leading-none" />
      <div className="min-w-0 max-w-full flex-1">
        <span
          className={`block break-words ${getToggleHeadingClass(block.headingLevel)} py-0.5 leading-relaxed text-[var(--osio-fg-default)]`}
          dangerouslySetInnerHTML={content ?? undefined}
        />
        {hasChildren ? (
          <div className="min-w-0 max-w-full">
            {block.children?.map((child, index) => (
              <ReadOnlyBlock key={child.id} block={child} index={index} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

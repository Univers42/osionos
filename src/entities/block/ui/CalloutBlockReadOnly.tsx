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

import React from "react";
import type { Block } from '@/entities/block';
import { CALLOUT_COLORS } from "@/entities/block";
import { parseInlineMarkdown } from '@/shared/lib/markengine';
import { resolveInternalPageLinkTitle } from "@/entities/page/model/resolveInternalPageLinkTitle";
import { ReadOnlyBlock } from "./ReadOnlyBlock";

export const CalloutBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const icon = block.color || "💡";
  const colors = CALLOUT_COLORS[icon] || {
    bg: "bg-[var(--color-surface-secondary)]",
    border: "border-[var(--color-line)]",
    text: "text-[var(--color-ink)]",
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
      <span className={`text-lg shrink-0 ${colors.text}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm ${colors.text} leading-relaxed py-0.5`}
          dangerouslySetInnerHTML={content ?? undefined}
        />
        {block.children?.length ? (
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

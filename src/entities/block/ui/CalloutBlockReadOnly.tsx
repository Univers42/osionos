/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CalloutBlockReadOnly.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AssetRenderer } from "@univers42/ui-collection";
import type { Block } from "@/entities/block";
import { parseInlineMarkdown } from "@/shared/lib/markengine";

export const CalloutBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const icon = block.color || "💡";
  const colors = {
    bg: "bg-[var(--color-surface-primary)]",
    border: "border-[var(--color-line)]",
    text: "text-[var(--color-ink)]",
  };
  const content = block.content
    ? { __html: parseInlineMarkdown(block.content) }
    : null;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border my-0.5 ${colors.bg} ${colors.border}`}
    >
      <span className={`shrink-0 ${colors.text}`}>
        <AssetRenderer value={icon} size={20} />
      </span>
      <span
        className={`text-sm ${colors.text} leading-relaxed py-0.5 flex-1`}
        dangerouslySetInnerHTML={content ?? undefined}
      />
    </div>
  );
};

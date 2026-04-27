/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaBlockReadOnly.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu          #+#    #+#             */
/*   Updated: 2026/04/14 00:00:00 by rstancu         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import type { Block } from "@/entities/block";
import { MediaBlockPreview } from "./MediaBlockPreview";
import { parseInlineMarkdown } from "@/shared/lib/markengine";
import { resolveInternalPageLinkTitle } from "@/entities/page/model/resolveInternalPageLinkTitle";

interface MediaBlockReadOnlyProps {
  block: Block;
}

function renderInlineMarkdown(content: string) {
  if (!content) return null;
  return {
    __html: parseInlineMarkdown(content, {
      resolveInternalLinkTitle: resolveInternalPageLinkTitle,
    }),
  };
}

export const MediaBlockReadOnly: React.FC<MediaBlockReadOnlyProps> = ({
  block,
}) => {
  return (
    <div className="my-3 space-y-2">
      <MediaBlockPreview block={block} />
      {block.content.trim() && (
        <p
          className="px-1 text-sm text-[var(--color-ink-muted)]"
          dangerouslySetInnerHTML={
            renderInlineMarkdown(block.content) ?? undefined
          }
        />
      )}
    </div>
  );
};

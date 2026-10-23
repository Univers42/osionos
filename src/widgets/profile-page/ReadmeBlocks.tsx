/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReadmeBlocks.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The README another viewer sees: the blocks the bridge projected into the profile card.
 * The viewer never reads the page itself (its sharing settings are not what lets them see
 * it), so this takes the projection and nothing else.
 */

import React from "react";

import type { Block } from "@/entities/block";
import { BoundFieldEmptyText, type BoundRecord } from "@/entities/block/model/binding";
import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { BindingProvider } from "./model/binding";

export interface ReadmeProjection {
  pageId: string;
  blocks?: Block[];
  truncated?: boolean;
}

export const ReadmeBlocks: React.FC<{ readme: ReadmeProjection | null | undefined; record: BoundRecord | null }> = ({ readme, record }) => {
  if (!readme) return null;
  if (readme.truncated) {
    return <p data-testid="readme-truncated" className="mt-8 text-sm text-[var(--osio-fg-muted)]">README too large to preview</p>;
  }
  if (!Array.isArray(readme.blocks) || readme.blocks.length === 0) return null;
  return (
    <section aria-label="README" data-testid="profile-readme" className="mt-8">
      <BindingProvider record={record}>
        <BoundFieldEmptyText.Provider value={null}>
          <PageBlocksRenderer blocks={readme.blocks} />
        </BoundFieldEmptyText.Provider>
      </BindingProvider>
    </section>
  );
};

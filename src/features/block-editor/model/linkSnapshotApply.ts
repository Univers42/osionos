/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkSnapshotApply.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// Writing a resolved snapshot back into the page tree. The lookup takes a moment; the
// user may have edited or undone meanwhile, so each write re-checks that the block still
// holds what was asked about and otherwise does nothing.

import type { Block } from "@/entities/block";
import { updateBlockInTree } from "@/entities/block/model/blockTreeUtils";
import { isLinkBlockType } from "@/entities/block/model/linkBlocks";
import type { EmbedSnapshot } from "@/shared/lib/embed/embedInfo";
import { withMentionTitle, type PasteLinkContext } from "./pasteLinkMenu";

export type SnapshotRequest =
  | { kind: "block"; blockId: string; url: string }
  | { kind: "mention"; blockId: string; context: PasteLinkContext };

export function requestedUrl(request: SnapshotRequest): string {
  return request.kind === "block" ? request.url : request.context.url;
}

function storeOnBlock(block: Block, url: string, snapshot: EmbedSnapshot): Block {
  return isLinkBlockType(block.type) && block.content === url ? { ...block, embed: snapshot } : block;
}

function titleOnMention(block: Block, context: PasteLinkContext, snapshot: EmbedSnapshot): Block {
  const content = withMentionTitle(block.content ?? "", context, snapshot.title);
  return content === null ? block : { ...block, content };
}

/** `blocks` with the snapshot applied for `request`; the same array when nothing matched. */
export function applySnapshot(blocks: Block[], request: SnapshotRequest, snapshot: EmbedSnapshot): Block[] {
  return updateBlockInTree(blocks, request.blockId, (block) =>
    request.kind === "block"
      ? storeOnBlock(block, request.url, snapshot)
      : titleOnMention(block, request.context, snapshot),
  );
}

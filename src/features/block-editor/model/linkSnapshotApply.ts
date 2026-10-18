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
// user may have edited, undone or left the page meanwhile, so the write is a keyed update
// of the target block on the tree as it is NOW (never the tree captured when the lookup
// began, which would overwrite later edits) and does nothing when the block is gone or
// no longer holds what was asked about.

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
  return content === null || content === block.content ? block : { ...block, content };
}

/** `blocks` with the snapshot applied for `request`; the same array when nothing matched. */
export function applySnapshot(blocks: Block[], request: SnapshotRequest, snapshot: EmbedSnapshot): Block[] {
  return updateBlockInTree(blocks, request.blockId, (block) =>
    request.kind === "block"
      ? storeOnBlock(block, request.url, snapshot)
      : titleOnMention(block, request.context, snapshot),
  );
}

/** Applies a resolved snapshot to the freshly read page and writes it back; nothing is
 *  written when the target block is gone or already up to date. */
export function commitSnapshot(
  readFreshContent: () => Block[],
  writeContent: (blocks: Block[]) => void,
  request: SnapshotRequest,
  snapshot: EmbedSnapshot,
): void {
  const current = readFreshContent();
  const next = applySnapshot(current, request, snapshot);
  if (next !== current) writeContent(next);
}

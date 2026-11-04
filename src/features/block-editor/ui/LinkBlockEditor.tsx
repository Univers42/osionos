/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LinkBlockEditor.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";
import { Bookmark, Globe } from "lucide-react";

import { BLOCK_MIN_WIDTH, blockSizeUpdate, type Block } from "@/entities/block";
import { linkPlaceholderText } from "@/shared/lib/embed/embedHints";
import { parseEmbedSnapshot } from "@/shared/lib/embed/embedInfo";
import { MAX_EMBED_HEIGHT, MIN_EMBED_HEIGHT, clampEmbedHeight } from "@/shared/lib/embed/embedPolicy";
import { appForbiddenOrigins, safeHttpUrl } from "@/shared/lib/embed/embedUrlGuard";
import { EmbedView } from "@/shared/ui/embed/EmbedView";
import { BlockResizeFrame } from "@/shared/ui/molecules/BlockResizeFrame";
import { LinkCard, type LinkCardData } from "@/shared/ui/embed/LinkCard";
import { chooseEmbedView } from "@/shared/ui/embed/model/chooseEmbedView";

import { useLinkBlockActions } from "../model/useLinkBlockActions";
import { LinkBlockDialog } from "./LinkBlockDialog";
import { LinkBlockToolbar } from "./LinkBlockToolbar";

interface LinkBlockEditorProps {
  block: Block;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onUpdateBlock: (updates: Partial<Block>) => void;
}

const STATUS_ROW =
  "flex w-full items-center gap-3 rounded-[var(--osio-radius-panel)] bg-[var(--osio-bg-subtle)] px-3 py-3 text-sm text-[var(--osio-fg-muted)]";

/** The editing surface of `embed` and `bookmark`. `content` is the URL and `block.embed`
 *  the untrusted snapshot, so rendering goes through the same guarded views as the
 *  read-only block. The wrapper handles only its own keys: the frame owns its input. */
export const LinkBlockEditor: React.FC<LinkBlockEditorProps> = ({ block, onKeyDown, onUpdateBlock }) => {
  const kind = block.type === "bookmark" ? "bookmark" : "embed";
  const url = block.content ?? "";
  const actions = useLinkBlockActions(block, onUpdateBlock);
  const snapshot = useMemo(() => parseEmbedSnapshot(block.embed), [block.embed]);
  const view = useMemo(
    () => chooseEmbedView({ url, snapshot, forbiddenOrigins: appForbiddenOrigins() }),
    [url, snapshot],
  );
  // Every embed takes a width; provider players keep their aspect, so only a plain framed
  // page has a user height. An "unknown" card becomes a generic frame on "Embed anyway",
  // so it already offers the height grips (they move nothing until the frame is there).
  const isGenericFrame = view.kind === "frame" && view.policy === "generic" && view.aspect === undefined;
  const hasUserHeight = isGenericFrame || (view.kind === "card" && view.reason === "unknown");
  const frameHeight = clampEmbedHeight(block.embedHeight);
  const hasLink = url.trim() !== "";

  const onWrapperKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" && !hasLink) {
      event.preventDefault();
      actions.openDialog();
      return;
    }
    onKeyDown(event);
  };

  let body: React.ReactNode;
  if (actions.resolvingUrl !== null) {
    body = <div role="status" className={STATUS_ROW}>Loading preview…</div>;
  } else if (!hasLink) {
    body = (
      <button
        type="button"
        onClick={actions.openDialog}
        aria-label={linkPlaceholderText(kind, actions.hint)}
        className={`${STATUS_ROW} text-left transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]`}
      >
        <span className="shrink-0 text-[var(--osio-fg-subtle)]">
          {kind === "embed" ? <Globe size={20} aria-hidden /> : <Bookmark size={20} aria-hidden />}
        </span>
        <span className="truncate">{linkPlaceholderText(kind, actions.hint)}</span>
      </button>
    );
  } else if (kind === "bookmark") {
    const card: LinkCardData = snapshot === null ? { url } : { ...snapshot, url };
    body = <LinkCard data={card} />;
  } else {
    body = (
      <BlockResizeFrame
        label="embed"
        widthPercent={block.mediaWidth}
        minWidth={BLOCK_MIN_WIDTH}
        resizesHeight={hasUserHeight}
        minHeight={MIN_EMBED_HEIGHT}
        maxHeight={MAX_EMBED_HEIGHT}
        heightTarget="[data-embed-frame-box]"
        onCommit={(commit) => onUpdateBlock(blockSizeUpdate(commit, "embedHeight"))}
      >
        <EmbedView url={url} snapshot={snapshot} height={hasUserHeight ? frameHeight : undefined} canEmbedAnyway />
      </BlockResizeFrame>
    );
  }

  return (
    <div // NOSONAR - keyboard navigation wrapper for a non-editable block
      onKeyDown={onWrapperKeyDown}
      tabIndex={-1}
      aria-label={`${kind === "embed" ? "Embed" : "Bookmark"} block`}
      data-testid="link-block-editor"
      className="group/link relative"
    >
      {body}
      {hasLink && actions.resolvingUrl === null ? (
        <LinkBlockToolbar kind={kind} openUrl={safeHttpUrl(url)} onReplace={actions.openDialog} onConvert={actions.convertTo} />
      ) : null}
      {actions.isDialogOpen ? (
        <LinkBlockDialog
          kind={kind}
          hint={actions.hint}
          initialUrl={url}
          onSubmit={(next) => void actions.commitUrl(next)}
          onClose={actions.closeDialog}
        />
      ) : null}
    </div>
  );
};

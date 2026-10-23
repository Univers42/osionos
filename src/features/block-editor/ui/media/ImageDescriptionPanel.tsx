import React from "react";
import type { Block } from "@/entities/block";
import { ImageTagChips } from "@/entities/block/ui/ImageTagChips";
import { addTag, removeTag } from "@/features/ai/model/imageDescription";
import { usePageStore } from "@/store/usePageStore";
import type { DescribeImageState } from "./useDescribeImage";

const BTN = "rounded-md border border-[var(--osio-border-default)] px-2 py-0.5 hover:bg-[var(--osio-bg-hover)]";

/** Under an image block: status, alt-text suggestion, editable tag chips. */
export const ImageDescriptionPanel: React.FC<{ pageId: string; block: Block; describe: DescribeImageState }> = ({
  pageId,
  block,
  describe,
}) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const tags = block.mediaTags ?? [];
  const setTags = (next: string[]) =>
    updateBlock(pageId, block.id, { mediaTags: next.length > 0 ? next : undefined });
  return (
    <div className="px-2 pb-2">
      <div aria-live="polite" className="text-2xs text-[var(--osio-fg-muted)]">
        {describe.running ? "Describing the image…" : null}
        {describe.error}
      </div>
      {describe.suggestion ? (
        <div className="flex flex-wrap items-center gap-2 text-2xs text-[var(--osio-fg-muted)]">
          <span>Suggested alt text: “{describe.suggestion}”</span>
          <button type="button" className={BTN} onClick={describe.replaceAlt}>Replace alt text</button>
          <button type="button" className={BTN} onClick={describe.keepMine}>Keep mine</button>
        </div>
      ) : null}
      <ImageTagChips
        tags={tags}
        text={block.mediaText}
        onAdd={(raw) => setTags(addTag(tags, raw))}
        onRemove={(tag) => setTags(removeTag(tags, tag))}
      />
    </div>
  );
};

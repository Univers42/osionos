/**
 * The tags and the found text of an image block. Read-only when no handler is
 * given (published pages); with `onAdd`/`onRemove` the chips are editable.
 */

import React, { useState } from "react";

interface ImageTagChipsProps {
  tags: readonly string[];
  text?: string;
  onAdd?: (raw: string) => void;
  onRemove?: (tag: string) => void;
}

const CHIP =
  "inline-flex items-center gap-1 rounded-full border border-[var(--osio-border-default)] px-2 py-0.5 text-2xs text-[var(--osio-fg-muted)]";

export const ImageTagChips: React.FC<ImageTagChipsProps> = ({ tags, text, onAdd, onRemove }) => {
  const [draft, setDraft] = useState("");
  if (tags.length === 0 && !text && !onAdd) return null;
  return (
    <div className="mt-1 flex flex-col gap-1 px-1" data-testid="image-tags">
      <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0" aria-label="Image tags">
        {tags.map((tag) => (
          <li key={tag} className={CHIP}>
            <span>{tag}</span>
            {onRemove ? (
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                className="rounded-full px-1 leading-none outline-none hover:bg-[var(--osio-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40"
                onClick={() => onRemove(tag)}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
        {onAdd ? (
          <li>
            <input
              type="text"
              value={draft}
              aria-label="Add tag"
              placeholder="Add tag"
              maxLength={40}
              className="w-24 rounded-full border border-transparent bg-transparent px-2 py-0.5 text-2xs outline-none focus:border-[var(--osio-border-default)]"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                onAdd(draft);
                setDraft("");
              }}
            />
          </li>
        ) : null}
      </ul>
      {text ? (
        <details className="text-2xs text-[var(--osio-fg-muted)]">
          <summary className="cursor-pointer">Text in image</summary>
          <p className="m-0 whitespace-pre-wrap">{text}</p>
        </details>
      ) : null}
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlaceholderBlock.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useState } from "react";
import type { CSSProperties } from "react";
import { EditableContent } from "@/components/blocks/EditableContent";
import type { Block } from "@/entities/block";

interface Props {
  block: Block;
  pageId: string;
  style?: CSSProperties;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onRequestSlashMenu?: (position: { x: number; y: number; top: number }) => void;
  onUpdatePlaceholderText: (text: string) => void;
}

/**
 * Template-only fillable block. Two in-place modes (no toggle buttons):
 *   • fill   — single-click and type the real value over the prompt (like an input);
 *   • prompt — double-click (or `#` on an empty block) to edit the placeholder's own prompt.
 * The prompt is stored in `placeholderText`; the filled value in `content`.
 */
export const PlaceholderBlock: React.FC<Props> = ({
  block, pageId, style, onChange, onKeyDown, onPaste, onRequestSlashMenu, onUpdatePlaceholderText,
}) => {
  const [mode, setMode] = useState<"fill" | "prompt">("fill");
  const [focused, setFocused] = useState(false);
  const prompt = block.placeholderText ?? "";
  const isEmpty = (block.content ?? "") === "";

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mode === "fill" && e.key === "#" && (block.content ?? "") === "") {
        e.preventDefault();
        setMode("prompt");
        return;
      }
      onKeyDown(e);
    },
    [mode, block.content, onKeyDown],
  );

  return (
    <div
      data-placeholder-block
      onDoubleClick={() => setMode("prompt")}
      title={mode === "prompt" ? "Editing placeholder prompt" : "Click to fill · double-click or # to edit the prompt"}
      className={`group/ph relative my-0.5 rounded-md border border-dashed px-2 py-1 transition-colors ${
        mode === "prompt"
          ? "border-[var(--osio-accent)] bg-[var(--osio-bg-subtle)]"
          : "border-[var(--osio-border-default)] hover:border-[var(--osio-border-strong)] hover:bg-[var(--osio-bg-hover)]"
      }`}
    >
      <EditableContent
        key={mode}
        content={mode === "prompt" ? prompt : (block.content ?? "")}
        placeholder={mode === "prompt" ? "Placeholder prompt…" : (prompt || "Fill in…")}
        style={style}
        pageId={pageId}
        className="text-sm text-[var(--osio-fg-default)]"
        onChange={mode === "prompt" ? onUpdatePlaceholderText : onChange}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onRequestSlashMenu={onRequestSlashMenu}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); if (mode === "prompt") setMode("fill"); }}
      />
      {mode === "fill" && isEmpty && prompt && !focused ? (
        <span className="pointer-events-none absolute left-2 top-1 select-none text-sm text-[var(--osio-fg-subtle)]">{prompt}</span>
      ) : null}
      {mode === "prompt" ? (
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-[var(--osio-accent)] px-1 text-[10px] font-medium text-[var(--osio-accent-fg)]">prompt</span>
      ) : null}
    </div>
  );
};

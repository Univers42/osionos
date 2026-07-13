/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaCaption.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";

import { EditableContent } from "@/components/blocks/EditableContent";

interface MediaCaptionProps {
  content: string;
  style?: React.CSSProperties;
  pageId: string;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  /** When it turns true (Caption button), focus the field so its placeholder
   *  shows — EditableContent only paints the placeholder while focused. */
  autoFocus?: boolean;
}

/** Caption row under a media block: an editable line that focuses on demand. */
export const MediaCaption: React.FC<MediaCaptionProps> = ({
  content,
  style,
  pageId,
  onChange,
  onKeyDown,
  onPaste,
  autoFocus,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    wrapRef.current?.querySelector<HTMLElement>('[role="textbox"]')?.focus();
  }, [autoFocus]);

  return (
    <div ref={wrapRef} className="border-t border-[var(--osio-border-default)] px-3 py-2">
      <EditableContent
        content={content}
        className="min-h-[1.5em] text-sm leading-relaxed text-[var(--osio-fg-muted)]"
        style={style}
        placeholder="Write a caption..."
        onChange={onChange}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        pageId={pageId}
      />
    </div>
  );
};

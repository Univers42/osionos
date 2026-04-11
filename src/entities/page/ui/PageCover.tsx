/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageCover.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:47:31 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Trash2 } from "lucide-react";
import { COVER_PRESETS } from "@/shared/ui/molecules/EmojiPicker/constants";

interface PageCoverProps {
  /** Current cover value — URL or CSS gradient string. */
  cover: string;
  /** Update the cover. */
  onChangeCover: (cover: string) => void;
  /** Remove the cover entirely. */
  onRemoveCover: () => void;
}

/**
 * Full-width cover image/gradient at the top of a Notion page.
 * Shows a gallery picker on "Change cover".
 */
export const PageCover: React.FC<PageCoverProps> = ({
  cover,
  onChangeCover,
  onRemoveCover,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const isGradient =
    cover.startsWith("linear-gradient") || cover.startsWith("radial-gradient");
  const isUrl = !isGradient;

  /* Close picker on outside click */
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const handleSelect = useCallback(
    (preset: string) => {
      onChangeCover(preset);
      setShowPicker(false);
    },
    [onChangeCover],
  );

  const handleRemove = useCallback(() => {
    onRemoveCover();
    setShowPicker(false);
  }, [onRemoveCover]);

  return (
    <div className="notion-page-cover">
      {isUrl ? (
        <img
          src={cover}
          alt=""
          className="notion-page-cover-img"
          draggable={false}
        />
      ) : (
        <div
          className="notion-page-cover-gradient"
          style={{ background: cover }}
        />
      )}

      {/* Hover controls */}
      <div className="notion-page-cover-controls">
        <button
          type="button"
          className="notion-page-cover-btn"
          onClick={() => setShowPicker((v) => !v)}
        >
          <ImageIcon size={14} />
          Change cover
        </button>
        <button
          type="button"
          className="notion-page-cover-btn"
          onClick={handleRemove}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Cover picker */}
      {showPicker && (
        <div ref={pickerRef} className="notion-cover-picker">
          <div className="notion-cover-picker-header">Gallery</div>
          <div className="notion-cover-picker-grid">
            {COVER_PRESETS.map((preset: string, index: number) => (
              <button
                key={`${preset}-${index}`}
                type="button"
                className={`notion-cover-picker-item ${preset === cover ? "notion-cover-picker-item--active" : ""}`}
                onClick={() => handleSelect(preset)}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: preset,
                    borderRadius: 2,
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

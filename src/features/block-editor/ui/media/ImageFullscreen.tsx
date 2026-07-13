/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ImageFullscreen.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ImageFullscreenProps {
  url: string;
  alt: string;
  onClose: () => void;
}

/** Dark-scrim portal overlay: Esc / scrim-click closes, focus stays trapped. */
export const ImageFullscreen: React.FC<ImageFullscreenProps> = ({ url, alt, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const raf = requestAnimationFrame(() => setVisible(true));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Capture phase + stop: this modal is topmost, so it must win the key
        // even when a focused contenteditable stops Escape from bubbling.
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const stop = useCallback((event: React.MouseEvent) => event.stopPropagation(), []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image full screen"
      onClick={onClose}
      className={[
        "fixed inset-0 z-[10050] flex items-center justify-center bg-[var(--osio-overlay)] p-6",
        "transition-opacity duration-150 motion-reduce:transition-none",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="Close full screen"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40"
      >
        <X size={18} />
      </button>
      <img
        src={url}
        alt={alt}
        onClick={stop}
        className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
};

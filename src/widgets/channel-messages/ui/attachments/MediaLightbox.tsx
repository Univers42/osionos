/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MediaLightbox.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Fullscreen image viewer (portal): zoom with the wheel or +/- (anchored on the
 * cursor for the wheel), pan by dragging or the arrow keys, 0 to reset, Esc or a
 * backdrop click to close. The bytes are an already-authed blob: URL — viewing
 * never re-downloads.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';

interface MediaLightboxProps {
  src: string;
  name?: string;
  onClose: () => void;
}

const MIN = 1;
const MAX = 8;
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));

export const MediaLightbox: React.FC<MediaLightboxProps> = ({ src, name, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const reset = useCallback(() => { setScale(1); setPan({ x: 0, y: 0 }); }, []);

  const zoomAt = useCallback((factor: number, cx = 0, cy = 0) => {
    setScale((prev) => {
      const next = clamp(prev * factor);
      if (next === prev) return prev;
      setPan((p) => ({ x: cx - ((cx - p.x) / prev) * next, y: cy - ((cy - p.y) / prev) * next }));
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomAt(1.25);
      else if (e.key === '-' || e.key === '_') zoomAt(0.8);
      else if (e.key === '0') reset();
      else if (e.key === 'ArrowLeft') setPan((p) => ({ ...p, x: p.x + 40 }));
      else if (e.key === 'ArrowRight') setPan((p) => ({ ...p, x: p.x - 40 }));
      else if (e.key === 'ArrowUp') setPan((p) => ({ ...p, y: p.y + 40 }));
      else if (e.key === 'ArrowDown') setPan((p) => ({ ...p, y: p.y - 40 }));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, zoomAt, reset]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--osio-z-modal)] flex items-center justify-center bg-[var(--osio-overlay)] backdrop-blur-md"
      onClick={onClose}
      onWheel={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.15 : 0.87, e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
      }}
      onMouseMove={(e) => {
        if (!dragRef.current) return;
        setPan({ x: dragRef.current.px + (e.clientX - dragRef.current.x), y: dragRef.current.py + (e.clientY - dragRef.current.y) });
      }}
      onMouseUp={() => { dragRef.current = null; }}
    >
      <div className="absolute right-4 top-4 z-10 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(0.8)} className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] p-2 text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"><Minus size={18} /></button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.25)} className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] p-2 text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"><Plus size={18} /></button>
        <button type="button" aria-label="Reset zoom" onClick={reset} className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] p-2 text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"><RotateCcw size={18} /></button>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] p-2 text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"><X size={18} /></button>
      </div>
      <img
        src={src}
        alt={name ?? ''}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => { e.preventDefault(); dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; }}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }}
        className="max-h-[90vh] max-w-[90vw] select-none rounded-md object-contain shadow-2xl transition-transform duration-75"
      />
    </div>,
    document.body,
  );
};

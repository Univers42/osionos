/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChatComposerMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The chat composer's "/" launcher — a FOCUSED set of chat actions (Image, File,
 * Voice, Link), not the block editor's page/database/heading catalog (which is
 * meaningless in a message). Portals to <body> and anchors ABOVE the input (the
 * composer lives at the bottom of the viewport). Arrow/Enter/Escape navigation.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileUp, Image as ImageIcon, Link2, Mic } from 'lucide-react';

export type ChatCommandId = 'image' | 'file' | 'voice' | 'link';

interface ChatCommand { id: ChatCommandId; label: string; hint: string; icon: React.ReactNode }

const COMMANDS: ChatCommand[] = [
  { id: 'image', label: 'Image', hint: 'Upload a photo', icon: <ImageIcon size={15} /> },
  { id: 'file', label: 'File', hint: 'Attach a document', icon: <FileUp size={15} /> },
  { id: 'voice', label: 'Voice message', hint: 'Record audio (max 1:00)', icon: <Mic size={15} /> },
  { id: 'link', label: 'Link', hint: 'Paste a URL preview', icon: <Link2 size={15} /> },
];

interface ChatComposerMenuProps {
  filter: string;
  position: { x: number; top: number };
  onPick: (id: ChatCommandId) => void;
  onClose: () => void;
}

export const ChatComposerMenu: React.FC<ChatComposerMenuProps> = ({ filter, position, onPick, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = COMMANDS.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase()));
  const activeIdx = Math.min(active, Math.max(items.length - 1, 0));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
      else if (event.key === 'Enter') { event.preventDefault(); const item = items[activeIdx]; if (item) onPick(item.id); }
    };
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [items, activeIdx, onPick, onClose]);

  if (items.length === 0 || typeof document === 'undefined') return null;

  // Anchor the menu's BOTTOM just above the caret line so it opens upward.
  const viewportHeight = typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : 768;
  const style: React.CSSProperties = { left: position.x, bottom: viewportHeight - position.top + 8 };

  return createPortal(
    <div
      ref={ref}
      data-testid="chat-slash-menu"
      className="fixed z-[var(--osio-z-popover)] max-h-64 w-60 overflow-y-auto rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] py-1 shadow-[var(--osio-shadow-menu)]"
      style={style}
    >
      {items.map((command, index) => (
        <button
          key={command.id}
          type="button"
          data-command-id={command.id}
          onMouseEnter={() => setActive(index)}
          onClick={() => onPick(command.id)}
          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
            index === activeIdx ? 'bg-[var(--osio-bg-muted)]' : 'hover:bg-[var(--osio-bg-hover)]'
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]">
            {command.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-[var(--osio-fg-default)]">{command.label}</span>
            <span className="block text-xs text-[var(--osio-fg-subtle)]">{command.hint}</span>
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
};

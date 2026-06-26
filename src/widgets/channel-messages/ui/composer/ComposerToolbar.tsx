/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ComposerToolbar.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * LinkedIn/WhatsApp bottom action bar for the composer: Image, Paperclip
 * (attach), GIF, Smile (emoji popover via the shared EmojiTab grid) and Mic.
 * Image/attach open a hidden <input type=file> whose change feeds the parent's
 * useAttachmentUpload. The bar is presentational — uploads/recording live above.
 */

import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Mic, Paperclip, Smile } from 'lucide-react';

import { giphyEnabled, type GifItem } from '@/shared/chat/giphyApi';
import { EmojiTab } from '@/shared/ui/molecules/IconPicker/EmojiTab';
import { Popover } from '@/shared/ui/primitives/Popover';
import { useToastStore } from '@/shared/ui/primitives/useToastStore';
import { GifPicker } from './GifPicker';

interface ComposerToolbarProps {
  onPickFiles: (files: FileList, accept: 'image' | 'any') => void;
  onInsertEmoji: (emoji: string) => void;
  onPickGif: (gif: GifItem) => void;
  onStartVoice: () => void;
  disabled?: boolean;
}

const BTN =
  'inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:cursor-not-allowed disabled:opacity-40';

export const ComposerToolbar: React.FC<ComposerToolbarProps> = ({
  onPickFiles,
  onInsertEmoji,
  onPickGif,
  onStartVoice,
  disabled,
}) => {
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const emojiBtn = useRef<HTMLButtonElement>(null);
  const gifBtn = useRef<HTMLButtonElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [gifOpen, setGifOpen] = useState(false);

  const openGif = () => {
    if (giphyEnabled()) { setGifOpen((v) => !v); return; }
    useToastStore.getState().push({ kind: 'info', title: 'GIFs unavailable', description: 'GIPHY_API is not configured.' });
  };

  return (
    <div className="flex items-center gap-1">
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) onPickFiles(e.target.files, 'image'); e.target.value = ''; }}
      />
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) onPickFiles(e.target.files, 'any'); e.target.value = ''; }}
      />
      <button type="button" className={BTN} disabled={disabled} aria-label="Add image" onClick={() => imageInput.current?.click()}>
        <ImageIcon size={18} />
      </button>
      <button type="button" className={BTN} disabled={disabled} aria-label="Attach file" onClick={() => fileInput.current?.click()}>
        <Paperclip size={18} />
      </button>
      <button ref={gifBtn} type="button" className={BTN} disabled={disabled} aria-label="Add GIF" onClick={openGif}>
        <span className="text-[11px] font-bold leading-none">GIF</span>
      </button>
      <button ref={emojiBtn} type="button" className={BTN} disabled={disabled} aria-label="Add emoji" onClick={() => setEmojiOpen((v) => !v)}>
        <Smile size={18} />
      </button>
      <button type="button" className={BTN} disabled={disabled} aria-label="Record voice message" onClick={onStartVoice}>
        <Mic size={18} />
      </button>

      <Popover anchorRef={emojiBtn} open={emojiOpen} onClose={() => setEmojiOpen(false)} className="w-72">
        <div className="border-b border-[var(--osio-border-default)] p-2">
          <input
            value={emojiQuery}
            onChange={(e) => setEmojiQuery(e.target.value)}
            placeholder="Search emoji"
            className="w-full rounded-md bg-[var(--osio-bg-subtle)] px-2 py-1.5 text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          <EmojiTab query={emojiQuery} onPick={(emoji) => { onInsertEmoji(emoji); setEmojiOpen(false); }} />
        </div>
      </Popover>

      <Popover anchorRef={gifBtn} open={gifOpen} onClose={() => setGifOpen(false)} className="w-72">
        <GifPicker onPick={(gif) => { onPickGif(gif); setGifOpen(false); }} />
      </Popover>
    </div>
  );
};

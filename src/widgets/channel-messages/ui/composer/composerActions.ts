/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   composerActions.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Behaviour layer for MessageComposer, kept out of the component so each file
 * stays under the ≤5-function convention. Owns: slash detection on text change,
 * file uploads → drafts, voice-result → audio draft, slash-media → media draft,
 * and the slash command dispatch incl. the /url link-card flow (fetchLinkPreview
 * degrades to a bare {url} card on the bridge's 502).
 */

import type { RefObject } from 'react';

import type { MediaBlockType } from '@/entities/block';
import { fetchLinkPreview } from '@/shared/chat/attachmentApi';
import { fetchGifFile, type GifItem } from '@/shared/chat/giphyApi';
import type { Attachment } from '@/shared/chat/messageApi';
import { useToastStore } from '@/shared/ui/primitives/useToastStore';
import { caretAnchor, type useComposerDraft } from '../../model/useComposerDraft';
import type { VoiceResult } from '../../model/useVoiceRecorder';

type Draft = ReturnType<typeof useComposerDraft>;
interface Deps {
  draft: Draft;
  upload: (file: File) => Promise<Attachment | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/** A trailing "/word" token at the caret end opens the menu; whitespace closes it. */
function slashToken(value: string): string | null {
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(value);
  return match ? match[1] : null;
}

function stripUrlPrefix(value: string): string {
  return value.startsWith('url:') ? value.slice(4) : value;
}

export function useComposerActions({ draft, upload, textareaRef }: Deps) {
  const onTextChange = (value: string) => {
    draft.setText(value);
    const token = slashToken(value);
    if (token === null) { draft.closeSlash(); return; }
    draft.setSlashFilter(token);
    if (textareaRef.current) draft.setSlashAnchor(caretAnchor(textareaRef.current));
  };

  const insertText = (snippet: string) => {
    draft.setText(draft.text + snippet);
    textareaRef.current?.focus();
  };

  const uploadFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const att = await upload(file);
      if (att) draft.addAttachment(att);
    }
  };

  const addVoice = async (result: VoiceResult) => {
    const file = new File([result.blob], `voice-${Date.now()}.webm`, { type: result.blob.type || 'audio/webm' });
    const att = await upload(file);
    if (att) {
      draft.addAttachment({ ...att, type: 'audio', metadata: { ...att.metadata, durationMs: result.durationMs, waveform: result.peaks } });
    }
  };

  const addGif = async (gif: GifItem) => {
    try {
      const file = await fetchGifFile(gif);
      const att = await upload(file); // validates + toasts on its own failures
      if (att) draft.addAttachment(att);
    } catch {
      useToastStore.getState().push({ kind: 'error', title: 'Couldn’t add GIF', description: gif.title });
    }
  };

  const onSlashMedia = (kind: MediaBlockType, value: string) => {
    draft.closeSlash();
    draft.setText(draft.text.replace(/(?:^|\s)\/[^\s/]*$/, '').trimEnd());
    draft.addAttachment({ type: kind, url: stripUrlPrefix(value), name: kind });
  };

  const onSlashSelect = async (command: { id: string }) => {
    draft.closeSlash();
    draft.setText(draft.text.replace(/(?:^|\s)\/[^\s/]*$/, '').trimEnd());
    if (command.id !== 'media:url') return;
    const url = (globalThis.prompt?.('Paste a link to preview') ?? '').trim();
    if (!url) return;
    const preview = await fetchLinkPreview(url);
    draft.addAttachment({
      type: 'url',
      url: preview.url,
      metadata: { title: preview.title, description: preview.description, image: preview.image },
    });
  };

  return { onTextChange, insertText, uploadFiles, addVoice, addGif, onSlashMedia, onSlashSelect };
}

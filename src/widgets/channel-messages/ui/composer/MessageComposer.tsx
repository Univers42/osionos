/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessageComposer.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Rich chat composer: textarea (typing "/" at the caret opens the editor's
 * SlashCommandMenu), a LinkedIn/WhatsApp toolbar (image/attach/GIF/emoji/mic),
 * draft attachment chips, inline voice recording, and a /url link-card flow.
 * Holds the DRAFT attachments[] and calls onSend(text, attachments) — text-only
 * is allowed; Cmd/Ctrl+Enter sends. Uploads go through useAttachmentUpload;
 * voice + slash-media wiring live in ./composerActions to stay under 5 fns here.
 */

import React, { useRef } from 'react';
import { Send, X } from 'lucide-react';

import type { Attachment } from '@/shared/chat/messageApi';
import { useAttachmentUpload } from '../../model/useAttachmentUpload';
import { useComposerDraft } from '../../model/useComposerDraft';
import { ChatComposerMenu, type ChatCommandId } from './ChatComposerMenu';
import { ComposerToolbar } from './ComposerToolbar';
import { DraftAttachmentBar } from './DraftAttachmentBar';
import { VoiceRecorder } from './VoiceRecorder';
import { MentionAutocomplete, mentionQuery } from './MentionAutocomplete';
import { useComposerActions } from './composerActions';

interface MessageComposerProps {
  channelId: string;
  workspaceId: string;
  channelName?: string;
  compact?: boolean;
  replyTo?: { authorName: string; content: string } | null;
  onClearReply?: () => void;
  onSend: (text: string, attachments?: Attachment[]) => Promise<unknown> | unknown;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  channelId,
  channelName,
  compact,
  replyTo,
  onClearReply,
  onSend,
}) => {
  const draft = useComposerDraft(`osionos:chat:draft:${channelId}`);
  const { upload, uploading } = useAttachmentUpload(channelId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashFileRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = React.useState(false);
  const [slashAccept, setSlashAccept] = React.useState('');
  const [mention, setMention] = React.useState<string | null>(null);

  const actions = useComposerActions({ draft, upload, textareaRef });
  const canSend = Boolean(draft.text.trim() || draft.attachments.length);

  // "/" launcher commands map to the real composer actions (the file picker is a
  // hidden input clicked here so /image and /file reuse the upload pipeline).
  const runSlashCommand = (id: ChatCommandId) => {
    draft.closeSlash();
    draft.setText(draft.text.replace(/(?:^|\s)\/[^\s/]*$/, '').trimEnd());
    if (id === 'image' || id === 'file') {
      setSlashAccept(id === 'image' ? 'image/*' : '');
      requestAnimationFrame(() => slashFileRef.current?.click());
    } else if (id === 'voice') {
      setRecording(true);
    } else {
      void actions.onSlashSelect({ id: 'media:url' });
    }
  };

  const submit = () => {
    if (!canSend) return;
    setMention(null);
    // Only clear the draft when the send actually succeeded — a failed send must
    // keep the text so it is never silently lost.
    void Promise.resolve(onSend(draft.text, draft.attachments)).then((ok) => { if (ok !== false) draft.reset(); }).catch(() => undefined);
  };

  const pickMention = (username: string) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.text.length;
    const before = draft.text.slice(0, caret).replace(/@([a-z0-9_.]*)$/i, `@${username} `);
    draft.setText(before + draft.text.slice(caret));
    setMention(null);
    el?.focus();
  };

  return (
    <div className={compact ? 'border-t border-[var(--osio-border-default)] p-2' : 'border-t border-[var(--osio-border-default)] p-4'}>
      <div className={compact ? '' : 'mx-auto max-w-4xl'}>
        {replyTo && (
          <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-[var(--osio-accent)] bg-[var(--osio-bg-subtle)] px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-[var(--osio-accent)]">Replying to {replyTo.authorName}</span>
              <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{replyTo.content || 'Attachment'}</span>
            </div>
            <button type="button" aria-label="Cancel reply" onClick={onClearReply} className="rounded p-0.5 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">
              <X size={14} />
            </button>
          </div>
        )}
        <DraftAttachmentBar attachments={draft.attachments} onRemove={draft.removeAttachment} />

        {recording ? (
          <VoiceRecorder
            onComplete={(result) => { setRecording(false); void actions.addVoice(result); }}
            onCancel={() => setRecording(false)}
          />
        ) : (
          <div className="relative">
          {mention !== null && <MentionAutocomplete query={mention} onPick={pickMention} />}
          <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-2 focus-within:border-[var(--osio-accent)]">
            <textarea
              ref={textareaRef}
              value={draft.text}
              onChange={(e) => { actions.onTextChange(e.target.value); setMention(mentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length)); }}
              onBlur={() => setMention(null)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter inserts a newline. When the "/" menu is
                // open, let it handle Enter (command select) instead of sending.
                if (e.key === 'Enter' && !e.shiftKey && !draft.slashAnchor) { e.preventDefault(); submit(); }
              }}
              rows={1}
              placeholder={`Message #${channelName ?? 'channel'}`}
              className="max-h-40 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
            />
            <div className="flex items-center justify-between gap-2 px-1">
              <ComposerToolbar
                disabled={uploading}
                onPickFiles={(files) => actions.uploadFiles(files)}
                onInsertEmoji={(emoji) => actions.insertText(emoji)}
                onPickGif={(gif) => actions.addGif(gif)}
                onStartVoice={() => setRecording(true)}
              />
              <button
                type="button"
                onClick={submit}
                disabled={!canSend || uploading}
                aria-label="Send message"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
          </div>
        )}

        <input
          ref={slashFileRef}
          type="file"
          accept={slashAccept || undefined}
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) void actions.uploadFiles(e.target.files); e.target.value = ''; }}
        />

        {draft.slashAnchor && (
          <ChatComposerMenu
            position={draft.slashAnchor}
            filter={draft.slashFilter}
            onPick={runSlashCommand}
            onClose={draft.closeSlash}
          />
        )}
      </div>
    </div>
  );
};

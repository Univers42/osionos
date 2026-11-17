/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   StatusFields.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The status editor: an emoji chosen from the app's picker (anything that is not an emoji is
 * refused), presets that fill emoji and text, free text, a busy flag and an expiry choice.
 * Pure view over a `StatusForm`; saving lives in `useStatusEdit`.
 */

import React, { useState } from 'react';

import { Button, EmojiPicker, Input, Select, Toggle } from '@/shared/ui';
import { FieldFrame } from './PublicProfileFields';
import { STATUS_TEXT_LIMIT } from '../model/peopleSocialModel';
import { EXPIRY_CHOICES, KEEP_EXPIRY, STATUS_PRESETS, applyPreset, isStatusEmoji, type StatusForm } from './statusChoices';

interface StatusFieldsProps {
  form: StatusForm;
  error: string | null;
  onChange: (next: StatusForm) => void;
}

const EmojiChoice: React.FC<{ emoji: string; onChange: (emoji: string) => void }> = ({ emoji, onChange }) => {
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState(false);
  const choose = (value: string) => {
    // The picker also hands out icons and SVGs; a status can only carry an emoji.
    setRefused(!isStatusEmoji(value));
    if (isStatusEmoji(value)) onChange(value);
  };
  return (
    <div className="relative flex items-center gap-2">
      <Button aria-label={emoji ? `Status emoji ${emoji}, change` : 'Choose a status emoji'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">{emoji || '🙂'}</span>
      </Button>
      {emoji && <Button tone="ghost" onClick={() => onChange('')}>No emoji</Button>}
      {open && (
        <div className="absolute left-0 top-full z-[var(--osio-z-popover)] mt-2">
          <EmojiPicker current={emoji} onSelect={choose} onRemove={() => onChange('')} onClose={() => setOpen(false)} />
        </div>
      )}
      {refused && <span role="alert" className="text-xs text-[var(--osio-danger)]">A status takes an emoji. Pick one from the Emoji tab.</span>}
    </div>
  );
};

export const StatusFields: React.FC<StatusFieldsProps> = ({ form, error, onChange }) => (
  <FieldFrame id="profile-status-text" label="Status" hint="Shown on your avatar and card. It clears by itself at the time you choose." error={error}>
    {(aria) => (
      <div className="space-y-2">
        <EmojiChoice emoji={form.emoji} onChange={(emoji) => onChange({ ...form, emoji })} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Status presets">
          {STATUS_PRESETS.map((preset) => (
            <Button key={preset.text} onClick={() => onChange(applyPreset(form, preset))}>{preset.emoji} {preset.text}</Button>
          ))}
        </div>
        <Input {...aria} maxLength={STATUS_TEXT_LIMIT} placeholder="What are you up to?" value={form.text} onChange={(event) => onChange({ ...form, text: event.target.value })} />
        <div className="flex items-center gap-2 text-sm">
          <Toggle label="Busy" checked={form.busy} onChange={(busy) => onChange({ ...form, busy })} /> <span aria-hidden="true">Busy</span>
        </div>
        <Select aria-label="Clear status" value={form.minutes} onChange={(event) => onChange({ ...form, minutes: Number(event.target.value) })}>
          {form.minutes === KEEP_EXPIRY && <option value={KEEP_EXPIRY}>Keep the current expiry</option>}
          {EXPIRY_CHOICES.map((choice) => <option key={choice.minutes} value={choice.minutes}>{choice.label === 'Never' ? 'Never clear' : `Clear ${choice.label.toLowerCase()}`}</option>)}
        </Select>
      </div>
    )}
  </FieldFrame>
);

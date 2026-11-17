/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileEditForm.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The public-profile form: every field of the server profile row, saved with `If-Match`
 * through the profile store. Hosted by the Settings section and by the profile page, so
 * the fields, the validators and the save path exist once. The host guarantees the store
 * holds a profile (it owns the loading and unavailable states).
 */

import React, { useCallback, useMemo, useState } from 'react';

import { Button, useToastStore } from '@/shared/ui';
import { useAccountProfileStore } from '@/store/settings';
import { LinksField, TextField, TimezoneField } from './PublicProfileFields';
import { diffProfile, formFromProfile, toPatch, validateField, type ProfileForm } from './profileFields';

const ORDER = ['displayName', 'pronouns', 'headline', 'bio', 'location', 'company', 'website', 'links', 'timezone', 'orcid', 'patreon'] as const;

function formErrors(draft: ProfileForm): Partial<Record<keyof ProfileForm, string>> {
  const errors: Partial<Record<keyof ProfileForm, string>> = {};
  for (const name of ORDER) {
    const message = validateField(name, draft[name] as never);
    if (message) errors[name] = message;
  }
  return errors;
}

export interface ProfileEditFormProps {
  /** Rows drawn above the fields (photo, banner) by a host that has no image to edit in place. */
  media?: (displayName: string) => React.ReactNode;
  saveLabel: string;
  discardLabel: string;
  /** Called after a successful save and after a discard. */
  onDone?: () => void;
}

export const ProfileEditForm: React.FC<ProfileEditFormProps> = ({ media, saveLabel, discardLabel, onDone }) => {
  const toast = useToastStore((state) => state.push);
  const { profile, save } = useAccountProfileStore();
  const [edits, setEdits] = useState<ProfileForm | null>(null);
  const [serverField, setServerField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflicted, setConflicted] = useState(false);

  const saved = useMemo(() => (profile ? formFromProfile(profile) : null), [profile]);
  // `edits` is null until something is typed, so an untouched form follows the store (an avatar
  // change, a 412) while typed text is never replaced by it.
  const draft = edits ?? saved;

  const errors = useMemo(() => (draft ? formErrors(draft) : {}), [draft]);
  const changed = useMemo(() => (saved && draft ? diffProfile(saved, draft) : {}), [saved, draft]);
  const dirty = Object.keys(changed).length > 0;

  const edit = useCallback(<K extends keyof ProfileForm>(name: K, value: ProfileForm[K]) => {
    setEdits((current) => { const base = current ?? saved; return base ? { ...base, [name]: value } : current; });
    setServerField((field) => (field === name ? null : field));
  }, [saved]);

  const submit = async () => {
    setSaving(true);
    const outcome = await save(toPatch(changed));
    setSaving(false);
    if (outcome.ok) {
      setEdits(null);
      setConflicted(false);
      toast({ kind: 'success', title: 'Profile saved' });
      onDone?.();
    } else if (outcome.reason === 'conflict') setConflicted(true);
    else if (outcome.reason === 'invalid') setServerField(outcome.field);
    else toast({ kind: 'error', title: 'The profile could not be saved. Try again.' });
  };

  const takeSavedVersion = () => {
    setEdits(null);
    setConflicted(false);
  };

  const discard = () => {
    takeSavedVersion();
    onDone?.();
  };

  const shown = (name: keyof ProfileForm): string | undefined => errors[name] ?? (serverField === name ? 'The server refused this value.' : undefined);

  if (!profile || !draft) return null;

  return (
    <form className="space-y-1" noValidate onSubmit={(event) => { event.preventDefault(); if (dirty && !saving && Object.keys(errors).length === 0) void submit(); }}>
      {media?.(draft.displayName)}
      <TextField name="displayName" autoComplete="name" label="Display name" hint="1 to 100 characters, on one line." value={draft.displayName} error={shown('displayName')} onChange={(v) => edit('displayName', v)} />
      <TextField name="pronouns" label="Pronouns" hint="Up to 40 characters." value={draft.pronouns} error={shown('pronouns')} onChange={(v) => edit('pronouns', v)} />
      <TextField name="headline" label="Headline" hint="Up to 200 characters." value={draft.headline} error={shown('headline')} onChange={(v) => edit('headline', v)} />
      <TextField name="bio" label="Bio" hint="Up to 2000 characters. Line breaks are kept." multiline max={2000} value={draft.bio} error={shown('bio')} onChange={(v) => edit('bio', v)} />
      <TextField name="location" label="Location" hint="Up to 120 characters." value={draft.location} error={shown('location')} onChange={(v) => edit('location', v)} />
      <TextField name="company" autoComplete="organization" label="Company" hint="Up to 100 characters." value={draft.company} error={shown('company')} onChange={(v) => edit('company', v)} />
      <TextField name="website" autoComplete="url" label="Website" hint="Starts with http:// or https://." value={draft.website} error={shown('website')} onChange={(v) => edit('website', v)} />
      <LinksField value={draft.links} error={shown('links')} onChange={(v) => edit('links', v)} />
      <TimezoneField value={draft.timezone} error={shown('timezone')} onChange={(v) => edit('timezone', v)} />
      <TextField name="orcid" label="ORCID" hint="Sixteen digits like 0000-0002-1825-0097; the last may be X." value={draft.orcid} error={shown('orcid')} onChange={(v) => edit('orcid', v.toUpperCase())} />
      <TextField name="patreon" label="Patreon" hint="Your handle only: letters, numbers, hyphens and underscores." value={draft.patreon} error={shown('patreon')} onChange={(v) => edit('patreon', v)} />
      {conflicted && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--osio-radius-panel)] border border-[var(--osio-warning)] bg-[var(--osio-bg-subtle)] p-3 text-sm text-[var(--osio-fg-default)]">
          <span>This profile changed somewhere else since you opened it. Save to keep your edits over it, or take the saved version.</span>
          <Button onClick={takeSavedVersion}>Use the saved version</Button>
        </div>
      )}
      <p className="pt-2 text-xs text-[var(--osio-fg-muted)]">Who can see this: everyone in your workspaces and the people directory, unless you hide your profile in Privacy.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" disabled={!dirty || saving} onClick={discard}>{discardLabel}</Button>
        <Button type="submit" tone="primary" disabled={!dirty || saving || Object.keys(errors).length > 0}>{saving ? 'Saving…' : saveLabel}</Button>
      </div>
    </form>
  );
};

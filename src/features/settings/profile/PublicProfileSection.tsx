/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublicProfileSection.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The public profile editor: every field of the server profile row, saved with
 * `If-Match` through the profile store. The form is drawn only when the server can
 * take the save; an offline build gets an explanation instead of a dead form.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserX } from 'lucide-react';

import { api, getActivePageJwt } from '@/shared/api/client';
import { Button, useToastStore } from '@/shared/ui';
import { useAccountProfileStore } from '@/store/settings';
import { ConfirmModal } from '../ui/ConfirmModals';
import { Avatar, EmptyState, PanelStatus, Section } from '../ui/settingsKit';
import { BannerUpload } from './BannerUpload';
import { ImageAvatarUpload } from './ImageAvatarUpload';
import { LinksField, TextField, TimezoneField } from './PublicProfileFields';
import { diffProfile, formFromProfile, toPatch, validateField, type ProfileForm } from './profileFields';

const ORDER = ['displayName', 'pronouns', 'headline', 'bio', 'location', 'company', 'website', 'links', 'timezone', 'orcid', 'patreon'] as const;

function avatarIconValue(url: string | null | undefined): string | undefined {
  return url && /^(https:\/\/|\/)/.test(url) ? `img:${url}` : undefined;
}

function formErrors(draft: ProfileForm): Partial<Record<keyof ProfileForm, string>> {
  const errors: Partial<Record<keyof ProfileForm, string>> = {};
  for (const name of ORDER) {
    const message = validateField(name, draft[name] as never);
    if (message) errors[name] = message;
  }
  return errors;
}

const PhotoRow: React.FC<{ avatarUrl: string | null; name: string; onChanged: () => void }> = ({ avatarUrl, name, onChanged }) => {
  const toast = useToastStore((state) => state.push);
  const [asking, setAsking] = useState(false);

  const remove = async () => {
    setAsking(false);
    try {
      await api.delete('/api/profile/avatar', getActivePageJwt() ?? undefined);
      toast({ kind: 'success', title: 'Photo removed' });
      onChanged();
    } catch {
      toast({ kind: 'error', title: 'The photo could not be removed. Try again.' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 pb-2">
      <Avatar value={avatarIconValue(avatarUrl)} label={name} size={60} />
      <ImageAvatarUpload onUploaded={onChanged} />
      {avatarUrl && <Button tone="danger" onClick={() => setAsking(true)}>Remove photo</Button>}
      {asking && (
        <ConfirmModal
          title="Remove your photo?"
          message="Your profile goes back to showing your initials. You can upload a new photo any time."
          actionLabel="Remove photo"
          danger
          onConfirm={remove}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
};

export const PublicProfileSection: React.FC = () => {
  const toast = useToastStore((state) => state.push);
  const { status, profile, error, hydrate, save } = useAccountProfileStore();
  const [edits, setEdits] = useState<ProfileForm | null>(null);
  const [serverField, setServerField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflicted, setConflicted] = useState(false);

  useEffect(() => { void hydrate(); }, [hydrate]);

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
    } else if (outcome.reason === 'conflict') setConflicted(true);
    else if (outcome.reason === 'invalid') setServerField(outcome.field);
    else toast({ kind: 'error', title: 'The profile could not be saved. Try again.' });
  };

  const useServerVersion = () => {
    setEdits(null);
    setConflicted(false);
  };

  const shown = (name: keyof ProfileForm): string | undefined => errors[name] ?? (serverField === name ? 'The server refused this value.' : undefined);

  if (status === 'unavailable') {
    return (
      <Section title="Public profile" anchor="public-profile">
        <EmptyState
          icon={<UserX size={16} />}
          title="Your public profile can't be edited here"
          hint="This version of osionos is not connected to a server that stores profiles. Connect to your workspace server to edit it."
        />
      </Section>
    );
  }

  return (
    <Section title="Public profile" anchor="public-profile">
      <PanelStatus status={profile ? 'ready' : status === 'error' ? 'error' : 'loading'} error={error} onRetry={() => void hydrate()}>
        {profile && draft && (
          <form className="space-y-1" noValidate onSubmit={(event) => { event.preventDefault(); if (dirty && !saving && Object.keys(errors).length === 0) void submit(); }}>
            <PhotoRow avatarUrl={profile.avatarUrl} name={draft.displayName} onChanged={() => void hydrate()} />
            <BannerUpload bannerUrl={profile.bannerUrl} onChanged={() => void hydrate()} />
            <TextField name="displayName" autoComplete="nickname" label="Display name" hint="1 to 100 characters, on one line." value={draft.displayName} error={shown('displayName')} onChange={(v) => edit('displayName', v)} />
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
                <Button onClick={useServerVersion}>Use the saved version</Button>
              </div>
            )}
            <p className="pt-2 text-xs text-[var(--osio-fg-muted)]">Who can see this: everyone in your workspaces and the people directory, unless you hide your profile in Privacy.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" disabled={!dirty || saving} onClick={useServerVersion}>Discard changes</Button>
              <Button type="submit" tone="primary" disabled={!dirty || saving || Object.keys(errors).length > 0}>{saving ? 'Saving…' : 'Save profile'}</Button>
            </div>
          </form>
        )}
      </PanelStatus>
    </Section>
  );
};

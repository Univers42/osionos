/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileSidebar.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The profile sidebar in read mode: identity, status, the person's facts and, for the owner
 * only, one call-to-action row per empty section. Every value comes from the profile record
 * through `buildSidebar`; nothing is written here.
 */

import React, { useEffect, useState } from "react";
import { Building2, Clock, Link2, MapPin } from "lucide-react";

import { ProfileAvatar } from "./ProfileAvatar";
import { ProfileActions } from "./profileChrome";
import { buildSidebar, type PromptField, type SidebarFact, type SidebarModel } from "./model/sidebarModel";
import type { MemberProfile } from "./useProfile";

const FACT_ICON: Record<string, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  company: Building2,
  location: MapPin,
  time: Clock,
};

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const FactRow: React.FC<{ fact: SidebarFact }> = ({ fact }) => {
  const Icon = FACT_ICON[fact.id] ?? Link2;
  return (
    <li className="flex min-w-0 items-center gap-2">
      <Icon size={16} aria-hidden />
      {fact.href ? (
        <a href={fact.href} target="_blank" rel="noopener noreferrer me" className="min-w-0 break-all text-[var(--osio-accent)] hover:underline">
          {fact.label}
        </a>
      ) : (
        <span data-testid={fact.id === "time" ? "local-time" : undefined} className="min-w-0 break-words">{fact.label}</span>
      )}
    </li>
  );
};

const StatusLine: React.FC<{ status: NonNullable<SidebarModel["status"]> }> = ({ status }) => (
  <p data-testid="profile-status" className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--osio-radius-panel)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm">
    {status.emoji && <span aria-hidden="true">{status.emoji}</span>}
    {status.text && <span className="min-w-0 break-words">{status.text}</span>}
    {status.busy && <span className="text-xs font-medium text-[var(--osio-fg-muted)]">Busy</span>}
  </p>
);

const Prompts: React.FC<{ model: SidebarModel; onAdd: (field: PromptField) => void }> = ({ model, onAdd }) => (
  <ul className="mt-4 space-y-1">
    {model.prompts.map((prompt) => (
      <li key={prompt.field}>
        <button
          type="button"
          onClick={() => onAdd(prompt.field)}
          className="text-sm text-[var(--osio-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          {prompt.label}
        </button>
      </li>
    ))}
  </ul>
);

interface ProfileSidebarProps {
  userId: string;
  profile: MemberProfile;
  isOwner: boolean;
  onAdd: (field: PromptField) => void;
}

export const ProfileSidebar: React.FC<ProfileSidebarProps> = ({ userId, profile, isOwner, onAdd }) => {
  const now = useMinuteClock();
  const model = buildSidebar(profile, { isOwner, now });
  return (
    <div>
      <ProfileAvatar name={model.name} sources={[profile.avatarUrl, profile.avatar]} online={profile.online} status={model.status} />
      <h1 className="mt-4 break-words text-2xl font-bold">{model.name}</h1>
      {(model.username || model.pronouns) && (
        <p className="text-sm text-[var(--osio-fg-muted)]">
          {model.username && <span>@{model.username}</span>}
          {model.username && model.pronouns && " · "}
          {model.pronouns && <span>{model.pronouns}</span>}
        </p>
      )}
      {model.headline && <p className="mt-2 break-words text-sm">{model.headline}</p>}
      {model.bio && <p className="mt-2 whitespace-pre-line break-words text-sm text-[var(--osio-fg-default)]">{model.bio}</p>}
      {model.status && <StatusLine status={model.status} />}
      <p className="mt-2 text-sm text-[var(--osio-fg-muted)]">{model.presence}</p>
      <ProfileActions userId={userId} name={model.name} />
      <Prompts model={model} onAdd={onAdd} />
      {model.facts.length > 0 && (
        <ul className="mt-6 space-y-1 text-sm text-[var(--osio-fg-muted)]">
          {model.facts.map((fact) => <FactRow key={fact.id} fact={fact} />)}
        </ul>
      )}
    </div>
  );
};

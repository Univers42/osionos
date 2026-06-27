/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SummonPrompt.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 18:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 18:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The consent surface for an incoming summon (AOC §7). A sticky card with a
 * clear Accept / Decline — the ONLY way a summon resolves to "accepted". On
 * Accept it opens the page the summoner is on; on Decline (or ignore→TTL) the
 * requester is told no. Nothing navigates the user without this explicit tap.
 */

import React from 'react';
import { createPortal } from 'react-dom';

import { usePageStore } from '@/store/usePageStore';
import { useCollabStore } from '../store/useCollabStore';
import { useSummonStore } from '../store/useSummonStore';
import { memberInitials } from '../model/collabPresence';

function openSummonedPage(pageId: string): void {
  const state = usePageStore.getState();
  const page = state.pageById(pageId);
  if (page) state.openPage({ id: page._id, workspaceId: page.workspaceId, kind: 'page', title: page.title, icon: page.icon });
}

export const SummonPrompt: React.FC = () => {
  const incoming = useSummonStore((state) => state.incoming);
  const answer = useSummonStore((state) => state.answer);
  const member = useCollabStore((state) =>
    state.members.find((m) => m.memberId === incoming?.fromId));
  if (!incoming || typeof document === 'undefined') return null;

  const name = member?.displayName ?? 'A teammate';
  const accept = () => { openSummonedPage(incoming.route); answer(true); };

  return createPortal(
    <div
      role="dialog"
      aria-live="polite"
      aria-label={`${name} is asking you to join them`}
      className="fixed bottom-4 right-4 z-[60] w-72 rounded-[var(--osio-radius-card)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] p-3 shadow-[var(--osio-shadow-menu)] motion-safe:animate-[collab-flag-in_140ms_ease-out]"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          style={{ outline: `2px solid ${member?.color ?? 'var(--collab-1)'}`, outlineOffset: '1px' }}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-bg-subtle)] text-xs font-medium text-[var(--osio-fg-muted)]"
        >
          {member?.avatarRef ? <img src={member.avatarRef} alt="" className="h-full w-full object-cover" /> : memberInitials(name)}
        </span>
        <p className="min-w-0 flex-1 text-sm text-[var(--osio-fg-default)]">
          <span className="font-semibold">{name}</span> wants you to join them here.
        </p>
      </div>
      {incoming.message && (
        <p className="mt-2 rounded-md bg-[var(--osio-bg-subtle)] px-2 py-1 text-xs text-[var(--osio-fg-muted)]">“{incoming.message}”</p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => answer(false)}
          className="rounded-md px-3 py-1.5 text-sm text-[var(--osio-fg-muted)] transition-colors duration-150 hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={accept}
          className="rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] transition-transform duration-150 hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-elevated)]"
        >
          Join
        </button>
      </div>
    </div>,
    document.body,
  );
};

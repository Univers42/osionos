/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileSharedPosts.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "Shared" gallery on a member profile — the posts they shared to their profile,
 * each opening the page on click (the delivery target for feed share-to-profile).
 * Renders nothing when the member has shared no posts.
 */

import React from 'react';

import { genId, type WorkspaceTab } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { useProfileShares, type ProfileShare } from './useProfileShares';

function isImage(cover: string | null): boolean {
  return Boolean(cover) && !String(cover).startsWith('linear-gradient');
}

function openShared(share: ProfileShare): void {
  // workspaceId '' — the page view resolves the page by id (ACL applies), same as
  // any deep-linked open; we don't know the owner's workspace from a share row.
  const tab: WorkspaceTab = {
    tabId: genId('tab'), pageId: share.pageId, workspaceId: '',
    kind: 'page', title: share.title, icon: share.icon ?? undefined, databaseId: null,
  };
  useWorkspaceLayout.getState().openTab(tab);
}

export const ProfileSharedPosts: React.FC<{ userId: string }> = ({ userId }) => {
  const shares = useProfileShares(userId);
  if (shares.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">Shared</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shares.map((share) => (
          <li key={share.pageId}>
            <button
              type="button"
              onClick={() => openShared(share)}
              className="group flex w-full flex-col overflow-hidden rounded-xl border border-[var(--osio-border-default)] text-left transition-shadow hover:shadow-md"
            >
              <span
                className="flex aspect-[16/9] items-center justify-center bg-[var(--osio-bg-subtle)] text-2xl"
                style={isImage(share.cover)
                  ? { backgroundImage: `url(${share.cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : share.cover ? { background: share.cover } : undefined}
              >
                {!isImage(share.cover) ? (share.icon ?? '📄') : null}
              </span>
              <span className="truncate px-3 py-2 text-sm font-medium text-[var(--osio-fg-default)]">
                {share.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

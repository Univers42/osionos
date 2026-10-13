/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublicPagesPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:36:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:36:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import type { PageEntry } from '@/entities/page';
import { useUserStore } from '@/features/auth';
import { usePageStore } from '@/store/usePageStore';
import { derivePageState } from '@/store/pageStore.helpers';
import {
  recordSettingsAction,
  useWorkspaceSettingsStore,
  type PublicDomain,
} from '@/store/settings';
import {
  Button,
  DataTable,
  Section,
  SettingRow,
  Switch,
} from './settingsUiComponents';

const EMPTY_PAGES: PageEntry[] = [];

function safeSlug(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '') || 'export';
}

export const PublicPagesPanel = () => {
  const userId = useUserStore((state) => state.activeUserId) || 'anonymous';
  const workspace = useUserStore((state) => state.activeWorkspace());
  const workspaceId = workspace?._id ?? 'local-workspace';
  const pages = usePageStore((state) => state.pages[workspaceId] ?? EMPTY_PAGES);
  const firstPublicPage = pages.find((page) => page.visibility === 'public');
  const storedSettings = useWorkspaceSettingsStore((state) => state.data[workspaceId]);
  const update = useWorkspaceSettingsStore((state) => state.update);
  const domains = storedSettings?.publicDomains ?? [];

  function publishPage(pageId: string, publicValue: boolean) {
    usePageStore.setState((state) => derivePageState({
      ...state.pages,
      [workspaceId]: (state.pages[workspaceId] ?? []).map((page) => page._id === pageId ? { ...page, visibility: publicValue ? 'public' : 'private' } : page),
    }, state.pageIdsByWorkspace));
    recordSettingsAction('public_page_toggle', { pageId, publicValue });
  }

  function addDomain() {
    const timestamp = new Date().toISOString();
    const domain: PublicDomain = { _id: `domain-${crypto.randomUUID()}`, domain: `${safeSlug(workspace?.name ?? 'workspace')}.osionos.site`, homepage: firstPublicPage?.title ?? workspace?.name ?? 'Home', status: 'live', createdAt: timestamp, updatedAt: timestamp };
    update(userId, workspaceId, { publicDomains: [domain, ...domains] });
  }

  const domainRows = domains.map((domain) => [
    <input key={`${domain._id}-domain`} className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" defaultValue={domain.domain} onBlur={(event) => update(userId, workspaceId, { publicDomains: domains.map((item) => item._id === domain._id ? { ...item, domain: event.target.value, updatedAt: new Date().toISOString() } : item) })} />,
    domain.homepage,
    <span key={`${domain._id}-status`} className="text-[var(--osio-accent)]">{domain.status}</span>,
  ]);

  return (
    <>
      <Section title="Public pages"><DataTable headers={['Page', 'Status', '']} rows={pages.map((page) => [page.title || 'Untitled', page.visibility === 'public' ? 'Live' : 'Private', <Switch key={`${page._id}-public`} checked={page.visibility === 'public'} onChange={(checked) => publishPage(page._id, checked)} />])} /></Section>
      <Section title="Domains"><DataTable headers={['Domain', 'Homepage', 'Status']} rows={domainRows.length ? domainRows : [['No domains yet', 'Select a public page', 'Draft']]} /><Button className="mt-4" onClick={addDomain}>New domain</Button></Section>
      <Section title="Settings"><SettingRow title="Always indicate that a page is live as a osionos Site" action={<Switch checked onChange={(checked) => recordSettingsAction('public_live_indicator_toggle', { checked })} />} /></Section>
    </>
  );
};

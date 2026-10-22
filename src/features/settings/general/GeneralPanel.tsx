/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   GeneralPanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from 'react';

// jszip / i18next / pdf-lib / qrcode are click-path only (export, language
// change, invoice PDF, 2FA QR): they are imported dynamically at their call
// sites so the settings chunk stays lean (~280KB of deps off its parse path).
import { Copy, Search } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { usePageStore } from '@/store/usePageStore';
import { defaultWorkspaceSettings } from '@/store/settings/defaults';
import { useWorkspaceMembersStore, useWorkspaceSettingsStore, type WorkspaceMember, type WorkspaceSettings, recordSettingsAction } from '@/store/settings';
import { API_BASE, getActiveJwt } from '@/shared/api/client';
import type { PageEntry } from '@/entities/page';
import { Button, EmojiPicker, IconValueView, IconButton, Toggle, useToastStore } from '@/shared/ui';
import { PageSelectorModal } from '../PageSelectorModal';
import { TypedConfirmModal } from '../ui/ConfirmModals';
import { Section, SettingRow } from '../ui/settingsKit';
import { csvCell, downloadBlob, downloadText, safeSlug } from '../model/settingsFiles';
import { noopHandledAction, runAsync } from '../model/settingsCalls';

const EMPTY_PAGES: PageEntry[] = [];
const EMPTY_WORKSPACE_MEMBERS: WorkspaceMember[] = [];

type SettingsModalName = 'page-selector' | 'delete-workspace';

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

export const GeneralPanel: React.FC<{ userId: string; workspaceName?: string; workspaceId?: string; membersCount: number }> = ({ userId, workspaceName = '42 school', workspaceId = '1edd3106-e5a4-4068-92a1-6b6e55a61ee6', membersCount }) => {
  const resolvedUserId = userId || 'anonymous';
  const toast = useToastStore((state) => state.push);
  const renameWorkspace = useUserStore((state) => state.renameWorkspace);
  const deleteWorkspace = useUserStore((state) => state.deleteWorkspace);
  const activeSession = useUserStore((state) => state.activeSession());
  const sessionWorkspaces = useMemo(
    () => [...(activeSession?.privateWorkspaces ?? []), ...(activeSession?.sharedWorkspaces ?? [])],
    [activeSession],
  );
  const pages = usePageStore((state) => state.pages[workspaceId] ?? EMPTY_PAGES);
  const workspaceMembers = useWorkspaceMembersStore((state) => state.data[workspaceId] ?? EMPTY_WORKSPACE_MEMBERS);
  const storedSettings = useWorkspaceSettingsStore((state) => state.data[workspaceId]);
  const hydrate = useWorkspaceSettingsStore((state) => state.hydrate);
  const update = useWorkspaceSettingsStore((state) => state.update);
  const reset = useWorkspaceSettingsStore((state) => state.reset);
  const fallbackSettings = useMemo<WorkspaceSettings>(() => defaultWorkspaceSettings(workspaceId, workspaceName), [workspaceId, workspaceName]);
  const settings = storedSettings ?? fallbackSettings;
  const analytics = settings.analytics as { pageViews?: boolean };
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState(settings.name);

  useEffect(() => {
    if (!workspaceNameDraft.trim() || workspaceNameDraft === settings.name) return;
    const timer = globalThis.setTimeout(() => {
      renameWorkspace(workspaceId, workspaceNameDraft.trim(), settings.icon ?? undefined);
      update(resolvedUserId, workspaceId, { name: workspaceNameDraft.trim() });
    }, 300);
    return () => globalThis.clearTimeout(timer);
  }, [renameWorkspace, resolvedUserId, settings.icon, settings.name, update, workspaceId, workspaceNameDraft]);

  useEffect(() => {
    runAsync(hydrate(resolvedUserId, workspaceId, workspaceName));
  }, [hydrate, resolvedUserId, workspaceId, workspaceName]);

  async function exportWorkspaceContent() {
    try {
      const jwt = getActiveJwt();
      if (jwt) {
        const response = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/export`, { headers: { Authorization: `Bearer ${jwt}` } });
        if (response.ok) {
          downloadBlob(`${safeSlug(settings.name)}.zip`, await response.blob());
          return;
        }
      }
    } catch {
      recordSettingsAction('workspace_export_remote_failed', { workspaceId });
    }
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    pages.forEach((page) => zip.file(`${safeSlug(page.title || 'untitled') || page._id}.json`, JSON.stringify(page, null, 2)));
    downloadBlob(`${safeSlug(settings.name)}.zip`, await zip.generateAsync({ type: 'blob' }));
  }

  function exportMembersCsv() {
    const rows = [['User ID', 'Role', 'Joined at'], ...workspaceMembers.map((member) => [member.userId, member.role, member.joinedAt])];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    downloadText(`${safeSlug(settings.name)}-members.csv`, csv, 'text/csv');
  }

  async function handleDeleteWorkspace() {
    if (sessionWorkspaces.length <= 1) {
      toast({ kind: 'warning', title: 'You need at least one workspace.' });
      return;
    }
    const deleted = await deleteWorkspace(workspaceId);
    if (deleted) toast({ kind: 'success', title: 'Workspace deleted' });
  }

  return (
    <>
      <Section title="Workspace settings">
        <SettingRow stack title="Workspace name" description="Your workspace name can be up to 65 characters" action={<input aria-label="Workspace name" className="w-full max-w-[400px] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={workspaceNameDraft} maxLength={65} onChange={(event) => setWorkspaceNameDraft(event.target.value)} />} />
        <SettingRow stack title="Icon" description="Upload an image or pick an emoji. This icon will appear in your sidebar and notifications." action={<div className="relative"><button type="button" aria-label="Change workspace icon" className="flex h-[72px] w-[72px] items-center justify-center rounded-md border border-[var(--osio-border-default)] text-5xl" onClick={() => setIconPickerOpen((open) => !open)}><IconValueView value={settings.icon ?? '🌏'} size={44} /></button>{iconPickerOpen && <div className="absolute left-0 top-full z-[var(--osio-z-popover)] mt-2"><EmojiPicker current={settings.icon ?? '🌏'} onSelect={(value) => { update(resolvedUserId, workspaceId, { icon: value }); renameWorkspace(workspaceId, settings.name, value); setIconPickerOpen(false); }} onRemove={() => { update(resolvedUserId, workspaceId, { icon: undefined }); setIconPickerOpen(false); }} onClose={() => setIconPickerOpen(false)} /></div>}</div>} />
        <SettingRow title="Custom landing page" description={<>When a new member joins this workspace, a copy of this page will be added to their <b>Private</b> pages</>} action={<Button onClick={() => setModal({ name: 'page-selector' })}>{settings.landingPageId ? 'Change page' : 'Select page'}</Button>} />
      </Section>
      <Section title="Export">
        <SettingRow title="Workspace content" description={`Export all pages in ${settings.name}. This can take longer depending on the size of the workspace.`} action={<Button onClick={() => runAsync(exportWorkspaceContent())}>Export</Button>} />
        <SettingRow title="Members" description={`${membersCount} members available locally. Upgrade text from prompt is kept as a disabled export pattern.`} action={<Button onClick={exportMembersCsv}>Export</Button>} />
      </Section>
      <Section title="Analytics">
        <SettingRow title="Save and display page view analytics" description={`Collect page view data for all pages in ${settings.name}. Editors can see how many views it has.`} action={<Toggle checked={analytics.pageViews ?? true} onChange={(checked) => update(resolvedUserId, workspaceId, { analytics: { ...settings.analytics, pageViews: checked } })} label="Save and display page view analytics" />} />
        <Button tone="ghost" className="-ml-2" onClick={() => noopHandledAction('settings_button_click', { label: 'Learn more' })}><Search size={14} /> Learn more</Button>
      </Section>
      <Section title="Danger zone">
        <SettingRow danger title="Delete workspace" description="Permanently delete this workspace, including all pages and files." action={<Button tone="danger" onClick={() => setModal({ name: 'delete-workspace' })}>Delete workspace</Button>} />
        <Button tone="ghost" className="-ml-2" onClick={() => { runAsync(reset(resolvedUserId, workspaceId, workspaceName)); }}>Reset to defaults</Button>
      </Section>
      <Section title="Workspace ID">
        <SettingRow title="Workspace ID" description={workspaceId} action={<IconButton label="Copy workspace ID" onClick={() => { runAsync(navigator.clipboard.writeText(workspaceId).then(() => toast({ kind: 'success', title: 'Workspace ID copied' }))); }}><Copy size={16} /></IconButton>} />
      </Section>
      {modal?.name === 'page-selector' && <PageSelectorModal pages={pages} selectedId={settings.landingPageId ?? null} onSelect={(pageId) => { update(resolvedUserId, workspaceId, { landingPageId: pageId }); setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.name === 'delete-workspace' && <TypedConfirmModal title="Delete workspace" message={`Type ${settings.name} to permanently delete this workspace.`} confirmText={settings.name} danger actionLabel="Delete workspace" onConfirm={() => runAsync(handleDeleteWorkspace())} onClose={() => setModal(null)} />}
    </>
  );
};

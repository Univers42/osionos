/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   GeneralPanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:42:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:42:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Search } from 'lucide-react';
import { EmojiPicker, IconValueView, Modal, useToastStore } from '@/shared/ui';
import type { PageEntry } from '@/entities/page';
import { useUserStore } from '@/features/auth';
import { API_BASE, getActiveJwt } from '@/shared/api/client';
import { useUIStore } from '@/shared/config/uiStore';
import { usePageStore } from '@/store/usePageStore';
import {
  recordSettingsAction,
  useWorkspaceMembersStore,
  useWorkspaceSettingsStore,
  type WorkspaceMember,
  type WorkspaceSettings,
} from '@/store/settings';
import { defaultWorkspaceSettings } from '@/store/settings/defaults';
import {
  Button,
  downloadBlob,
  downloadText,
  runAsync,
  Section,
  SettingRow,
  Switch,
} from './settingsUiComponents';

const EMPTY_PAGES: PageEntry[] = [];
const EMPTY_WORKSPACE_MEMBERS: WorkspaceMember[] = [];

function safeSlug(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '') || 'export';
}

function csvCell(value: unknown): string {
  const primitive = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '';
  return `"${String(primitive).replaceAll('"', '""')}"`;
}

export const TypedConfirmModal: React.FC<{ title: string; message: string; confirmText: string; actionLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }> = ({ title, message, confirmText, actionLabel, danger, onConfirm, onClose }) => {
  const [draft, setDraft] = useState('');
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-[var(--osio-fg-muted)]">{message}</p>
        <input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={confirmText} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone={danger ? 'danger' : 'primary'} disabled={draft !== confirmText} onClick={onConfirm}>{actionLabel}</Button></div>
      </div>
    </Modal>
  );
};

export const PageSelectorModal: React.FC<{ pages: PageEntry[]; selectedId: string | null; onSelect: (pageId: string | null) => void; onClose: () => void }> = ({ pages, selectedId, onSelect, onClose }) => (
  <Modal open onClose={onClose} title="Select landing page" size="md">
    <div className="space-y-2">
      <Button className="w-full justify-start" onClick={() => onSelect(null)}>No landing page</Button>
      {pages.slice(0, 20).map((page) => <Button key={page._id} className={`w-full justify-start ${selectedId === page._id ? 'border-[var(--osio-accent)]' : ''}`} onClick={() => onSelect(page._id)}>{page.icon ?? '📄'} {page.title || 'Untitled'}</Button>)}
    </div>
  </Modal>
);

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
  const setUseNewSidebar = useUIStore((state) => state.setUseNewSidebar);
  const setShowOtherApps = useUIStore((state) => state.setShowOtherApps);
  const pages = usePageStore((state) => state.pages[workspaceId] ?? EMPTY_PAGES);
  const workspaceMembers = useWorkspaceMembersStore((state) => state.data[workspaceId] ?? EMPTY_WORKSPACE_MEMBERS);
  const storedSettings = useWorkspaceSettingsStore((state) => state.data[workspaceId]);
  const hydrate = useWorkspaceSettingsStore((state) => state.hydrate);
  const update = useWorkspaceSettingsStore((state) => state.update);
  const reset = useWorkspaceSettingsStore((state) => state.reset);
  const fallbackSettings = useMemo<WorkspaceSettings>(() => defaultWorkspaceSettings(workspaceId, workspaceName), [workspaceId, workspaceName]);
  const settings = storedSettings ?? fallbackSettings;
  const sidebar = settings.sidebar as { newSidebar?: boolean; showApps?: boolean };
  const analytics = settings.analytics as { pageViews?: boolean };
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pageSelectorOpen, setPageSelectorOpen] = useState(false);
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
        <SettingRow stack title="Workspace name" description="Your workspace name can be up to 65 characters" action={<input aria-label="Workspace name" className="w-full max-w-[400px] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={workspaceNameDraft} maxLength={65} onChange={(event) => setWorkspaceNameDraft(event.target.value)} />} />
        <SettingRow stack title="Icon" description="Upload an image or pick an emoji. This icon will appear in your sidebar and notifications." action={<div className="relative"><button type="button" className="flex h-[72px] w-[72px] items-center justify-center rounded-md border border-[var(--osio-border-default)] text-5xl" onClick={() => setIconPickerOpen((open) => !open)}><IconValueView value={settings.icon ?? '🌏'} size={44} /></button>{iconPickerOpen && <div className="absolute left-0 top-full z-[var(--osio-z-popover)] mt-2"><EmojiPicker current={settings.icon ?? '🌏'} onSelect={(value: string) => { update(resolvedUserId, workspaceId, { icon: value }); renameWorkspace(workspaceId, settings.name, value); setIconPickerOpen(false); }} onRemove={() => { update(resolvedUserId, workspaceId, { icon: undefined }); setIconPickerOpen(false); }} onClose={() => setIconPickerOpen(false)} /></div>}</div>} />
        <SettingRow title="Custom landing page" description={<>When a new member joins this workspace, a copy of this page will be added to their <b>Private</b> pages</>} action={<Button onClick={() => setPageSelectorOpen(true)}>{settings.landingPageId ? 'Change page' : 'Select page'}</Button>} />
      </Section>
      <Section title="Sidebar">
        <SettingRow title={<span className="inline-flex items-center gap-2">Try the new sidebar <span className="rounded bg-[var(--osio-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--osio-accent-text)]">New</span></span>} description="Keep your pages, meetings, and AI within reach." action={<Switch checked={sidebar.newSidebar ?? true} onChange={(checked) => { setUseNewSidebar(checked); update(resolvedUserId, workspaceId, { sidebar: { ...settings.sidebar, newSidebar: checked } }); }} />} />
        <SettingRow title="Show other osionos apps in sidebar" description="Show osionos Calendar and osionos Mail in your sidebar" action={<Switch checked={sidebar.showApps ?? true} onChange={(checked) => { setShowOtherApps(checked); update(resolvedUserId, workspaceId, { sidebar: { ...settings.sidebar, showApps: checked } }); }} />} />
      </Section>
      <Section title="Export">
        <SettingRow title="Workspace content" description={`Export all pages in ${settings.name}. This can take longer depending on the size of the workspace.`} action={<Button onClick={() => runAsync(exportWorkspaceContent())}>Export</Button>} />
        <SettingRow title="Members" description={`${membersCount} members available locally. Upgrade text from prompt is kept as a disabled export pattern.`} action={<Button onClick={exportMembersCsv}>Export</Button>} />
      </Section>
      <Section title="Analytics">
        <SettingRow title="Save and display page view analytics" description={`Collect page view data for all pages in ${settings.name}. Editors can see how many views it has.`} action={<Switch checked={analytics.pageViews ?? true} onChange={(checked) => update(resolvedUserId, workspaceId, { analytics: { ...settings.analytics, pageViews: checked } })} />} />
        <Button tone="ghost" className="-ml-2"><Search size={14} /> Learn more</Button>
      </Section>
      <Section title="Danger zone">
        <SettingRow danger title="Delete workspace" description="Permanently delete this workspace, including all pages and files." action={<Button tone="danger" onClick={() => setDeleteModalOpen(true)}>Delete workspace</Button>} />
        <Button tone="ghost" className="-ml-2" onClick={() => { runAsync(reset(resolvedUserId, workspaceId, workspaceName)); }}>Reset to defaults</Button>
      </Section>
      <Section title="Workspace ID">
        <SettingRow title="Workspace ID" description={workspaceId} action={<Button tone="ghost" aria-label="Copy workspace ID" onClick={() => { runAsync(navigator.clipboard.writeText(workspaceId).then(() => toast({ kind: 'success', title: 'Workspace ID copied' }))); }}><Copy size={16} /></Button>} />
      </Section>
      {pageSelectorOpen && <PageSelectorModal pages={pages} selectedId={settings.landingPageId ?? null} onSelect={(pageId) => { update(resolvedUserId, workspaceId, { landingPageId: pageId }); setPageSelectorOpen(false); }} onClose={() => setPageSelectorOpen(false)} />}
      {deleteModalOpen && <TypedConfirmModal title="Delete workspace" message={`Type ${settings.name} to permanently delete this workspace.`} confirmText={settings.name} danger actionLabel="Delete workspace" onConfirm={() => runAsync(handleDeleteWorkspace())} onClose={() => setDeleteModalOpen(false)} />}
    </>
  );
};

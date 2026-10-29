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
import { Copy, Building2 } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { findEnvPage } from '@/features/variables/model/envFile';
import { openEnvFile } from '@/features/variables/model/openEnvFile';
import { usePageStore } from '@/store/usePageStore';
import { defaultWorkspaceSettings } from '@/store/settings/defaults';
import { useWorkspaceMembersStore, useWorkspaceSettingsStore, type WorkspaceMember, type WorkspaceSettings, recordSettingsAction } from '@/store/settings';
import { API_BASE, getActiveJwt } from '@/shared/api/client';
import type { PageEntry } from '@/entities/page';
import { Button, EmojiPicker, IconValueView, IconButton, Toggle, useToastStore } from '@/shared/ui';
import { PageSelectorModal } from '../PageSelectorModal';
import { ConfirmModal, TypedConfirmModal } from '../ui/ConfirmModals';
import { PendingDeleteBanner } from './PendingDeleteBanner';
import { EmptyState, PanelStatus, Section, SettingRow } from '../ui/settingsKit';
import { csvCell, downloadBlob, downloadText, safeSlug } from '../model/settingsFiles';
import { accountActionNotice, runAccountAction, runAsync } from '../model/settingsCalls';
import { isWorkspaceOwner, pendingDeleteFor } from '../model/workspaceOwnership';
import { useSettingsHydration } from '../model/settingsHydration';

const EMPTY_PAGES: PageEntry[] = [];
const EMPTY_WORKSPACE_MEMBERS: WorkspaceMember[] = [];

type SettingsModalName = 'page-selector' | 'delete-workspace' | 'leave-workspace' | 'reset-workspace';

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

export const GeneralPanel: React.FC<{ userId: string; workspaceName?: string; workspaceId?: string; membersCount: number }> = ({ userId, workspaceName, workspaceId: workspaceIdProp, membersCount }) => {
  const resolvedUserId = userId || 'anonymous';
  const activeWorkspaceId = useUserStore((state) => state.activeWorkspace())?._id;
  const workspaceId = workspaceIdProp || activeWorkspaceId || '';
  const toast = useToastStore((state) => state.push);
  const deleteWorkspace = useUserStore((state) => state.deleteWorkspace);
  const renameWorkspace = useUserStore((state) => state.renameWorkspace);
  const activeSession = useUserStore((state) => state.activeSession());
  const sessionWorkspaces = useMemo(
    () => [...(activeSession?.privateWorkspaces ?? []), ...(activeSession?.sharedWorkspaces ?? [])],
    [activeSession],
  );
  const currentWorkspace = sessionWorkspaces.find((workspace) => workspace._id === workspaceId);
  const isOwner = isWorkspaceOwner(currentWorkspace, resolvedUserId);
  const pendingDeleteAfter = pendingDeleteFor(currentWorkspace, resolvedUserId);
  const pages = usePageStore((state) => state.pages[workspaceId] ?? EMPTY_PAGES);
  const workspaceMembers = useWorkspaceMembersStore((state) => state.data[workspaceId] ?? EMPTY_WORKSPACE_MEMBERS);
  const storedSettings = useWorkspaceSettingsStore((state) => state.data[workspaceId]);
  const hydrate = useWorkspaceSettingsStore((state) => state.hydrate);
  const update = useWorkspaceSettingsStore((state) => state.update);
  const removeIcon = useWorkspaceSettingsStore((state) => state.removeIcon);
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
      const trimmedName = workspaceNameDraft.trim();
      update(resolvedUserId, workspaceId, { name: trimmedName });
      if (isOwner) renameWorkspace(workspaceId, trimmedName);
    }, 300);
    return () => globalThis.clearTimeout(timer);
  }, [resolvedUserId, settings.name, update, workspaceId, workspaceNameDraft, renameWorkspace, isOwner]);

  // The store keeps a failed read in `error` instead of rejecting, so it is turned back into a rejection here.
  const hydration = useSettingsHydration(async () => {
    await hydrate(resolvedUserId, workspaceId, workspaceName);
    const failure = useWorkspaceSettingsStore.getState().error[workspaceId];
    if (failure) throw new Error(failure);
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
    const outcome = await deleteWorkspace(workspaceId);
    // The code travels on the error so the dialog can tell a sudo refusal (Try again) from a failure.
    if (!outcome.ok) throw Object.assign(new Error(outcome.message ?? 'This workspace could not be deleted. Nothing was removed.'), { code: outcome.code });
    toast({ kind: 'success', title: 'Workspace scheduled for deletion', description: 'It is removed after 14 days. Cancel before then to keep it.' });
  }

  async function handleLeaveWorkspace() {
    const outcome = await runAccountAction(`/api/workspaces/${workspaceId}/leave`, {});
    const notice = accountActionNotice(outcome, 'Leaving the workspace');
    if (notice) toast(notice);
    if (!outcome.ok) throw new Error(outcome.message);
    toast({ kind: 'success', title: 'You left the workspace' });
  }

  if (!workspaceId) {
    return <EmptyState icon={<Building2 size={16} />} title="No workspace selected" hint="Open a workspace to see its settings." />;
  }

  return (
    <PanelStatus status={hydration.status} error={hydration.error} onRetry={hydration.retry}>
      <Section title="Workspace settings">
        <SettingRow stack title="Workspace name" description="Your workspace name can be up to 65 characters" action={<input aria-label="Workspace name" className="w-full max-w-[400px] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={workspaceNameDraft} maxLength={65} onChange={(event) => setWorkspaceNameDraft(event.target.value)} />} />
        <SettingRow stack title="Icon" description="Upload an image or pick an emoji. This icon will appear in your sidebar and notifications." action={<div className="relative"><button type="button" aria-label="Change workspace icon" className="flex h-[72px] w-[72px] items-center justify-center rounded-md border border-[var(--osio-border-default)] text-5xl" onClick={() => setIconPickerOpen((open) => !open)}><IconValueView value={settings.icon ?? '🌏'} size={44} /></button>{iconPickerOpen && <div className="absolute left-0 top-full z-[var(--osio-z-popover)] mt-2"><EmojiPicker current={settings.icon ?? '🌏'} onSelect={(value) => { update(resolvedUserId, workspaceId, { icon: value }); setIconPickerOpen(false); }} onRemove={() => { removeIcon(resolvedUserId, workspaceId); setIconPickerOpen(false); }} onClose={() => setIconPickerOpen(false)} /></div>}</div>} />
        <SettingRow title="Custom landing page" description={<>When a new member joins this workspace, a copy of this page will be added to their <b>Private</b> pages</>} action={<Button onClick={() => setModal({ name: 'page-selector' })}>{settings.landingPageId ? 'Change page' : 'Select page'}</Button>} />
        <SettingRow title="Variables" description={<>Reusable values for any page: write <code>{'{{NAME}}'}</code> in text to show them. They live in this workspace&apos;s <code>env.json</code>.</>} action={<Button onClick={() => runAsync(openEnvFile(workspaceId).then((opened) => { if (!opened) toast({ kind: 'error', title: 'Could not create env.json' }); }))}>{findEnvPage(pages) ? 'Open env.json' : 'Create env.json'}</Button>} />
        <SettingRow title="Reset to defaults" description="Restore the default workspace name, icon, landing page, sidebar and analytics." action={<Button tone="ghost" onClick={() => setModal({ name: 'reset-workspace' })}>Reset to defaults</Button>} />
      </Section>
      <Section title="Export">
        <SettingRow title="Workspace content" description={`Export all pages in ${settings.name}. This can take longer depending on the size of the workspace.`} action={<Button onClick={() => runAsync(exportWorkspaceContent())}>Export</Button>} />
        <SettingRow title="Members" description={`Download the members list as CSV (${membersCount} members).`} action={<Button onClick={exportMembersCsv}>Export</Button>} />
      </Section>
      <Section title="Analytics">
        <SettingRow title="Save and display page view analytics" description={`Collect page view data for all pages in ${settings.name}. Editors can see how many views it has.`} action={<Toggle checked={analytics.pageViews ?? true} onChange={(checked) => update(resolvedUserId, workspaceId, { analytics: { ...settings.analytics, pageViews: checked } })} label="Save and display page view analytics" />} />
      </Section>
      <Section title="Danger zone">
        {pendingDeleteAfter !== null && <PendingDeleteBanner workspaceId={workspaceId} userId={resolvedUserId} deleteAfter={pendingDeleteAfter} />}
        {isOwner ? (
          <SettingRow danger title="Delete workspace" description="Schedule this workspace for deletion. Nothing is removed for 14 days, and you can cancel until then." action={<Button tone="danger" onClick={() => setModal({ name: 'delete-workspace' })}>Delete workspace</Button>} />
        ) : (
          <SettingRow danger title="Leave workspace" description="You lose access to this workspace and its pages. The owner can invite you again." action={<Button tone="danger" onClick={() => setModal({ name: 'leave-workspace' })}>Leave workspace</Button>} />
        )}
      </Section>
      <Section title="Workspace ID">
        <SettingRow title="Workspace ID" description={workspaceId} action={<IconButton label="Copy workspace ID" onClick={() => { runAsync(navigator.clipboard.writeText(workspaceId).then(() => toast({ kind: 'success', title: 'Workspace ID copied' }))); }}><Copy size={16} /></IconButton>} />
      </Section>
      {modal?.name === 'page-selector' && <PageSelectorModal pages={pages} selectedId={settings.landingPageId ?? null} onSelect={(pageId) => { update(resolvedUserId, workspaceId, { landingPageId: pageId }); setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.name === 'reset-workspace' && <ConfirmModal title="Reset to defaults" message={`Restore the default name, icon, landing page, sidebar and analytics of ${settings.name}? Your pages are not touched.`} actionLabel="Reset to defaults" onConfirm={() => reset(resolvedUserId, workspaceId, workspaceName)} onClose={() => setModal(null)} />}
      {modal?.name === 'leave-workspace' && <ConfirmModal title="Leave workspace" message={`Leave ${settings.name}? You lose access until someone invites you again.`} actionLabel="Leave workspace" onConfirm={handleLeaveWorkspace} onClose={() => setModal(null)} />}
      {modal?.name === 'delete-workspace' && <TypedConfirmModal title="Delete workspace" message={`Type ${settings.name} to permanently delete this workspace.`} confirmText={settings.name} danger actionLabel="Delete workspace" onConfirm={handleDeleteWorkspace} onClose={() => setModal(null)} />}
    </PanelStatus>
  );
};

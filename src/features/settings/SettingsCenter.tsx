/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SettingsCenter.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:17:01 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Bot,
  CalendarDays,
  CreditCard,
  FileText,
  Globe,
  Import,
  Keyboard,
  KeyRound,
  LayoutGrid,
  Mail,
  Palette,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { LazyAutomationManager } from '@/features/automations/ui/LazyAutomationManager';
import {
  Button,
  IconButton,
  Modal,
  useSettingsSearchIndex,
  type SettingsSearchEntry,
  type SettingsTab,
} from '@/shared/ui';
import { McpPanel } from '@/features/settings/mcp/McpPanel';
import { PermissionsPanel } from '@/features/settings/permissions';
import { LazySocialSettings } from '@/features/settings/social/LazySocialSettings';
import { recordSettingsAction } from '@/store/settings';
import { AiPanel } from './ai/AiPanel';
import { BillingPanel } from './billing/BillingPanel';
import { ConnectionsPanel } from './connections/ConnectionsPanel';
import { GeneralPanel } from './general/GeneralPanel';
import { ImportPanel } from './import/ImportPanel';
import { LibraryPanel } from './library/LibraryPanel';
import { MailCalendarPanel } from './mail-calendar/MailCalendarPanel';
import { NotificationsPanel } from './notifications/NotificationsPanel';
import { PageSettingsPanel } from './page-settings/PageSettingsPanel';
import { PeoplePanel } from './people/PeoplePanel';
import { PlansPanel } from './plans/PlansPanel';
import { PreferencesPanel } from './preferences/PreferencesPanel';
import { ProfilePanel } from './profile/ProfilePanel';
import { PublicPagesPanel } from './public-pages/PublicPagesPanel';
import { TeamspacesPanel } from './teamspaces/TeamspacesPanel';
import { Avatar } from './ui/settingsKit';

interface SettingsCenterProps {
  initialTab?: SettingsTab;
  onClose: () => void;
}

type TabItem = { id: SettingsTab; label: string; icon: React.ReactNode };

const tabGroups: Array<{ label: string; tabs: TabItem[] }> = [
  {
    label: 'Account',
    tabs: [
      { id: 'profile', label: 'Profile', icon: <User size={16} /> },
      { id: 'preferences', label: 'Preferences', icon: <SlidersHorizontal size={16} /> },
      { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
      { id: 'connections', label: 'Connections', icon: <LayoutGrid size={16} /> },
      { id: 'contacts', label: 'Contacts', icon: <UserPlus size={16} /> },
      { id: 'mail_calendar', label: 'Mail & Calendar', icon: <Mail size={16} /> },
    ],
  },
  {
    label: 'Workspace',
    tabs: [
      { id: 'general', label: 'General', icon: <Settings size={16} /> },
      { id: 'people', label: 'People', icon: <Users size={16} /> },
      { id: 'import', label: 'Import', icon: <Import size={16} /> },
      { id: 'page_settings', label: 'Page settings', icon: <FileText size={16} /> },
      { id: 'shortcuts', label: 'Keyboard shortcuts', icon: <Keyboard size={16} /> },
    ],
  },
  {
    label: 'Features',
    tabs: [
      { id: 'ai', label: 'osionos AI', icon: <Sparkles size={16} /> },
      { id: 'mcp', label: 'osionos MCP', icon: <Bot size={16} /> },
      { id: 'public_pages', label: 'Public pages', icon: <Globe size={16} /> },
      { id: 'library', label: 'Emoji & Library', icon: <Palette size={16} /> },
    ],
  },
  {
    label: 'Access & billing',
    tabs: [
      { id: 'teamspaces', label: 'Teamspaces', icon: <Shield size={16} /> },
      { id: 'permissions', label: 'Permissions', icon: <KeyRound size={16} /> },
      { id: 'billing', label: 'Billing', icon: <CreditCard size={16} /> },
      { id: 'plans', label: 'Explore plans', icon: <CalendarDays size={16} /> },
    ],
  },
];

const prompts: Record<SettingsTab, { title: string; subtitle: string }> = {
  profile: { title: 'Profile', subtitle: 'Manage your profile, login information, and devices' },
  preferences: { title: 'Preferences', subtitle: 'Choose how you want osionos to look and behave' },
  notifications: { title: 'Notifications', subtitle: 'Decide when and how you want to be notified' },
  connections: { title: 'Connections', subtitle: 'Manage and explore connections' },
  contacts: { title: 'Contacts', subtitle: 'Manage your network, connection requests, blocked users and reports' },
  mail_calendar: { title: 'Mail & Calendar', subtitle: 'Manage emails and calendars connected to your osionos account' },
  general: { title: 'General', subtitle: 'Manage your workspace name, domains, and more' },
  people: { title: 'People', subtitle: 'Manage people in your workspace and their roles' },
  import: { title: 'Import', subtitle: 'Import data from other apps and files into osionos' },
  page_settings: { title: 'Page settings', subtitle: 'Actions, style switches, analytics and connections from settings_page.md' },
  shortcuts: { title: 'Keyboard shortcuts', subtitle: 'Rebind, add, toggle, and export keyboard shortcuts — each is an editable automation' },
  ai: { title: 'osionos AI', subtitle: 'Search everywhere, automate meeting notes and configure AI features' },
  mcp: { title: 'osionos MCP', subtitle: 'Connect osionos to your AI tools to summarize, search, and move faster' },
  public_pages: { title: 'Public pages', subtitle: 'Manage public content from your workspace' },
  library: { title: 'Emoji & Library', subtitle: 'Emoji + photo things that we upload' },
  teamspaces: { title: 'Teamspaces', subtitle: 'Manage teamspaces in this workspace' },
  permissions: { title: 'Permissions', subtitle: 'Role × resource access matrix, field masks, and live decision testing' },
  billing: { title: 'Billing', subtitle: 'Manage billing information and view your upcoming invoice' },
  plans: { title: 'Explore plans', subtitle: 'Compare all osionos plans' },
};

// McpPanel now lives in ./mcp/McpPanel (Discover/Manage tabs, app catalog,
// restrict policy, disconnect-all) — imported at the top of this file.

export const SettingsCenter: React.FC<SettingsCenterProps> = ({ initialTab = 'profile', onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [settingsQuery, setSettingsQuery] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const persona = useUserStore((s) => s.activePersona());
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());
  const members = useUserStore((s) => s.personas);
  const current = prompts[activeTab];
  const searchMatches = useSettingsSearchIndex(settingsQuery);
  const settingsResults = settingsQuery.trim() ? searchMatches.slice(0, 8) : [];

  // Below sm the section nav is a scrolling strip: a deep link to a tab past the
  // right edge would open with its tab out of sight. Only then: on desktop the
  // vertical nav would scroll its group labels away during the open animation.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    nav.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTab]);

  function openSearchResult(entry: SettingsSearchEntry) {
    setActiveTab(entry.tab);
    setSettingsQuery('');
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-settings-anchor="${entry.anchor}"]`);
      target?.scrollIntoView({ block: 'start' });
      target?.classList.add('rounded-lg', 'ring-2', 'ring-[var(--osio-accent)]', 'ring-offset-2', 'ring-offset-[var(--osio-bg-surface)]');
      globalThis.setTimeout(() => {
        target?.classList.remove('rounded-lg', 'ring-2', 'ring-[var(--osio-accent)]', 'ring-offset-2', 'ring-offset-[var(--osio-bg-surface)]');
      }, 1400);
    });
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && settingsResults[0]) {
      event.preventDefault();
      openSearchResult(settingsResults[0]);
    }
  }

  return (
    <Modal open onClose={onClose} title="Settings" description={current.subtitle} size="xl">
      <div className="flex h-[min(900px,94vh)] w-full flex-col overflow-hidden sm:flex-row">
        <aside ref={navRef} className="w-full shrink-0 border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] sm:w-[240px] sm:overflow-y-auto sm:border-b-0 sm:border-r">
          <div className="sm:flex sm:min-h-full sm:flex-col sm:justify-between">
            <div className="flex gap-1 overflow-x-auto p-2 sm:block sm:space-y-4 sm:overflow-visible">
              {tabGroups.map((group) => (
                <div key={group.label} className="flex gap-1 sm:block">
                  <p className="hidden px-2 py-1.5 text-xs font-medium text-[var(--osio-fg-subtle)] sm:block">{group.label}</p>
                  <div className="flex gap-1 sm:block sm:space-y-0.5">
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 text-left text-sm sm:w-full ${activeTab === tab.id ? 'bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]' : 'text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]'}`}
                      >
                        {tab.id === 'profile' ? <Avatar value={persona?.emoji} label={persona?.name} size={22} /> : <span className="flex h-5 w-5 items-center justify-center">{tab.icon}</span>}
                        <span className="truncate">{tab.id === 'profile' ? persona?.name ?? tab.label : tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 hidden border-t border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4 sm:block">
              <Button className="w-full" onClick={() => { recordSettingsAction('cta_click_ai', { source: 'settings_footer' }); setActiveTab('ai'); }}>
                <Sparkles size={16} /> Get osionos AI
              </Button>
            </div>
          </div>
        </aside>

        <section className="relative flex-1 overflow-hidden bg-[var(--osio-bg-surface)]" role="tabpanel" aria-label={current.title}>
          <IconButton label="Close settings" onClick={onClose} className="absolute right-3 top-3 z-[var(--osio-z-raised)] bg-[var(--osio-bg-surface)]"><X size={16} /></IconButton>
          <div className="h-full overflow-y-auto px-[clamp(18px,5vw,60px)] py-9">
            <div className="mx-auto flex w-full max-w-[800px] flex-col gap-9">
              <header className="space-y-2">
                <h2 className="text-2xl font-semibold leading-8 text-[var(--osio-fg-default)]">{current.title}</h2>
                <p className="text-base leading-6 text-[var(--osio-fg-default)]">{current.subtitle}</p>
                <div className="relative max-w-lg pt-2">
                  <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 text-sm text-[var(--osio-fg-muted)] focus-within:border-[var(--osio-accent)]">
                    <Search size={16} />
                    <input
                      value={settingsQuery}
                      onChange={(event) => setSettingsQuery(event.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search actions..."
                      className="min-w-0 flex-1 bg-transparent text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
                    />
                  </label>
                  {settingsResults.length > 0 ? (
                    <div className="absolute left-0 right-0 top-full z-[var(--osio-z-popover)] mt-2 overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-[var(--osio-shadow-menu)]">
                      {settingsResults.map((entry) => (
                        <button
                          key={`${entry.tab}-${entry.anchor}`}
                          type="button"
                          className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-[var(--osio-bg-hover)]"
                          onClick={() => openSearchResult(entry)}
                        >
                          <span className="font-medium text-[var(--osio-fg-default)]">{entry.label}</span>
                          <span className="text-xs capitalize text-[var(--osio-fg-muted)]">{entry.tab.replaceAll('_', ' ')}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </header>

              {activeTab === 'profile' && <ProfilePanel persona={persona} />}
              {activeTab === 'preferences' && <PreferencesPanel activeUserId={activeUserId} />}
              {activeTab === 'notifications' && <NotificationsPanel activeUserId={activeUserId} />}
              {activeTab === 'connections' && <ConnectionsPanel activeUserId={activeUserId} personaEmail={persona?.email} />}
              {activeTab === 'contacts' && <LazySocialSettings />}
              {activeTab === 'mail_calendar' && <MailCalendarPanel activeUserId={activeUserId} personaEmail={persona?.email} />}
              {activeTab === 'general' && <GeneralPanel userId={activeUserId} workspaceName={activeWorkspace?.name} workspaceId={activeWorkspace?._id} membersCount={members.length} />}
              {activeTab === 'people' && <PeoplePanel workspaceId={activeWorkspace?._id} activeUserId={activeUserId} personas={members} membersCount={members.length} />}
              {activeTab === 'import' && <ImportPanel workspaceId={activeWorkspace?._id} activeUserId={activeUserId} />}
              {activeTab === 'page_settings' && <PageSettingsPanel />}
              {activeTab === 'shortcuts' && <LazyAutomationManager />}
              {activeTab === 'ai' && <AiPanel />}
              {activeTab === 'mcp' && <McpPanel />}
              {activeTab === 'public_pages' && <PublicPagesPanel />}
              {activeTab === 'library' && <LibraryPanel />}
              {activeTab === 'teamspaces' && <TeamspacesPanel workspaceName={activeWorkspace?.name} />}
              {activeTab === 'permissions' && <PermissionsPanel workspaceId={activeWorkspace?._id} />}
              {activeTab === 'billing' && <BillingPanel workspaceId={activeWorkspace?._id} />}
              {activeTab === 'plans' && <PlansPanel workspaceId={activeWorkspace?._id} />}
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
};

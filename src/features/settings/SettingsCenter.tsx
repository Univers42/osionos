/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SettingsCenter.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:17:01 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 20:17:02 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* eslint-disable react/prop-types */
import React, { useMemo, useState } from 'react';
import {
  Bell,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  Database,
  FileDown,
  FileText,
  Globe,
  Import,
  LayoutGrid,
  Mail,
  MoreHorizontal,
  Palette,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AssetRenderer } from '@univers42/ui-collection';

import { useUserStore, type StaticPersona } from '@/features/auth';
import { WorkspaceThemeControls } from '@/features/theme/WorkspaceThemePanel';

type SettingsTab =
  | 'profile'
  | 'preferences'
  | 'notifications'
  | 'connections'
  | 'mail_calendar'
  | 'general'
  | 'people'
  | 'import'
  | 'page_settings'
  | 'ai'
  | 'mcp'
  | 'public_pages'
  | 'library'
  | 'teamspaces'
  | 'billing'
  | 'plans';

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
  mail_calendar: { title: 'Mail & Calendar', subtitle: 'Manage emails and calendars connected to your osionos account' },
  general: { title: 'General', subtitle: 'Manage your workspace name, domains, and more' },
  people: { title: 'People', subtitle: 'Manage people in your workspace and their roles' },
  import: { title: 'Import', subtitle: 'Import data from other apps and files into osionos' },
  page_settings: { title: 'Page settings', subtitle: 'Actions, style switches, analytics and connections from settings_page.md' },
  ai: { title: 'osionos AI', subtitle: 'Search everywhere, automate meeting notes and configure AI features' },
  mcp: { title: 'osionos MCP', subtitle: 'Connect osionos to your AI tools to summarize, search, and move faster' },
  public_pages: { title: 'Public pages', subtitle: 'Manage public content from your workspace' },
  library: { title: 'Emoji & Library', subtitle: 'Emoji + photo things that we upload' },
  teamspaces: { title: 'Teamspaces', subtitle: 'Manage teamspaces in this workspace' },
  billing: { title: 'Billing', subtitle: 'Manage billing information and view your upcoming invoice' },
  plans: { title: 'Explore plans', subtitle: 'Compare all osionos plans' },
};

const rowBorder = 'border-t border-[var(--color-line)]';

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger' | 'ghost' }> = ({ className = '', tone = 'default', ...props }) => {
  const toneClass = {
    default: 'border border-[var(--color-line)] bg-[var(--color-surface-primary)] text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]',
    primary: 'bg-[var(--color-accent)] text-white hover:opacity-90',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/15',
    ghost: 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
  }[tone];

  return <button type="button" className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${toneClass} ${className}`} {...props} />;
};

const SelectButton: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Button className="whitespace-nowrap">
    {children}
    <ChevronDown size={14} />
  </Button>
);

const Switch: React.FC<{ checked?: boolean }> = ({ checked = false }) => (
  <span className={`flex h-[18px] w-[34px] rounded-full p-0.5 transition ${checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-tertiary)]'}`}>
    <span className={`h-3.5 w-3.5 rounded-full bg-white transition ${checked ? 'translate-x-4' : ''}`} />
  </span>
);

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`space-y-4 ${className}`}>
    <h3 className="border-b border-[var(--color-line)] pb-3 text-base font-medium text-[var(--color-ink)]">{title}</h3>
    <div>{children}</div>
  </section>
);

const SettingRow: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  stack?: boolean;
  danger?: boolean;
}> = ({ title, description, action, stack = false, danger = false }) => (
  <div className={`flex w-full gap-3 py-3 ${rowBorder} ${stack ? 'flex-col items-start' : 'flex-wrap items-center justify-between'}`}>
    <div className="min-w-[220px] flex-1">
      <div className={`text-sm font-medium ${danger ? 'text-red-500' : 'text-[var(--color-ink)]'}`}>{title}</div>
      {description && <div className="mt-1 text-[13px] leading-[18px] text-[var(--color-ink-muted)]">{description}</div>}
    </div>
    {action && <div className="flex shrink-0 items-center justify-end gap-2">{action}</div>}
  </div>
);

const DataTable: React.FC<{ headers: string[]; rows: React.ReactNode[][]; className?: string }> = ({ headers, rows, className = '' }) => (
  <div className={`overflow-x-auto rounded-lg border border-[var(--color-line)] ${className}`}>
    <table className="w-full min-w-[560px] table-fixed text-sm">
      <thead className="bg-[var(--color-surface-secondary)] text-left text-xs font-medium text-[var(--color-ink-muted)]">
        <tr>{headers.map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-[var(--color-line)]">
        {rows.map((row) => {
          const firstCell = row[0];
          const rowKey = React.isValidElement(firstCell) && firstCell.key ? String(firstCell.key) : row.map(String).join('|');
          return (
          <tr key={rowKey} className="hover:bg-[var(--color-surface-hover)]">
            {row.map((cell, cellIndex) => <td key={headers[cellIndex] ?? String(cell)} className="px-3 py-2 align-middle text-[var(--color-ink)]">{cell}</td>)}
          </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const MiniTabs: React.FC<{ tabs: Array<{ label: string; count?: number }>; active?: string }> = ({ tabs, active }) => (
  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[var(--color-surface-secondary)] p-1">
    {tabs.map((tab) => (
      <button
        key={tab.label}
        type="button"
        className={`rounded-md px-3 py-1.5 text-sm font-medium ${active === tab.label ? 'bg-[var(--color-surface-primary)] text-[var(--color-ink)] shadow-sm' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]'}`}
      >
        {tab.label}{typeof tab.count === 'number' && <span className="ml-1 text-[var(--color-ink-faint)]">{tab.count}</span>}
      </button>
    ))}
  </div>
);

const Avatar: React.FC<{ value?: string; label?: string; size?: number }> = ({ value = '👤', label, size = 28 }) => (
  <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-line)] bg-[var(--color-surface-secondary)]" style={{ width: size, height: size }}>
    <AssetRenderer value={value} size={Math.max(16, size - 8)} aria-label={label} />
  </span>
);

const FeatureCard: React.FC<{ icon?: React.ReactNode; title: string; description: string; action?: React.ReactNode }> = ({ icon, title, description, action }) => (
  <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] p-4">
    <div className="flex items-start gap-3">
      {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-secondary)] text-[var(--color-accent)]">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-medium text-[var(--color-ink)]">{title}</h4>
        <p className="mt-1 text-[13px] leading-[18px] text-[var(--color-ink-muted)]">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  </div>
);

export const SettingsCenter: React.FC<SettingsCenterProps> = ({ initialTab = 'profile', onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const persona = useUserStore((s) => s.activePersona());
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());
  const members = useUserStore((s) => s.personas);
  const current = prompts[activeTab];

  const memberRows = useMemo(
    () => members.slice(0, 20).map((member, index) => [
      <div key={member.id || member.email} className="flex items-center gap-3">
        <input type="checkbox" className="h-3.5 w-3.5" />
        <Avatar value={member.emoji} label={member.name} />
        <div className="min-w-0">
          <div className="truncate font-medium">{member.name}</div>
          <div className="truncate text-xs text-[var(--color-ink-muted)]">{member.email}</div>
        </div>
      </div>,
      <SelectButton key={`${member.email}-access`}>{index % 3 === 0 ? '2 pages' : '1 page'}</SelectButton>,
      <Button key={`${member.email}-menu`} tone="ghost" className="px-2"><MoreHorizontal size={16} /></Button>,
    ]),
    [members],
  );

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-[var(--color-backdrop)] px-4 py-6">
      <div className="flex h-[min(900px,94vh)] w-full max-w-6xl overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] shadow-2xl">
        <aside className="w-[240px] shrink-0 overflow-y-auto border-r border-[var(--color-line)] bg-[var(--color-surface-secondary)]">
          <div className="flex min-h-full flex-col justify-between">
            <div className="space-y-4 p-2">
              {tabGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-2 py-1.5 text-xs font-medium text-[var(--color-ink-faint)]">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${activeTab === tab.id ? 'bg-[var(--color-surface-tertiary)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]'}`}
                      >
                        {tab.id === 'profile' ? <Avatar value={persona?.emoji} label={persona?.name} size={22} /> : <span className="flex h-5 w-5 items-center justify-center">{tab.icon}</span>}
                        <span className="truncate">{tab.id === 'profile' ? persona?.name ?? tab.label : tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 border-t border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-4">
              <Button className="w-full" onClick={() => setActiveTab('ai')}>
                <Sparkles size={15} /> Get osionos AI
              </Button>
            </div>
          </div>
        </aside>

        <section className="relative flex-1 overflow-hidden bg-[var(--color-surface-primary)]" role="tabpanel" aria-label={current.title}>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-full bg-[var(--color-surface-secondary)] p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
          <div className="h-full overflow-y-auto px-[clamp(18px,5vw,60px)] py-9">
            <div className="mx-auto flex w-full max-w-[800px] flex-col gap-9">
              <header className="space-y-2">
                <h2 className="text-[26px] font-semibold leading-8 text-[var(--color-ink)]">{current.title}</h2>
                <p className="text-base leading-6 text-[var(--color-ink)]">{current.subtitle}</p>
              </header>

              {activeTab === 'profile' && <ProfilePanel persona={persona} />}
              {activeTab === 'preferences' && <PreferencesPanel />}
              {activeTab === 'notifications' && <NotificationsPanel />}
              {activeTab === 'connections' && <ConnectionsPanel />}
              {activeTab === 'mail_calendar' && <MailCalendarPanel personaEmail={persona?.email} />}
              {activeTab === 'general' && <GeneralPanel workspaceName={activeWorkspace?.name} workspaceId={activeWorkspace?._id} membersCount={members.length} />}
              {activeTab === 'people' && <PeoplePanel rows={memberRows} membersCount={members.length} />}
              {activeTab === 'import' && <ImportPanel />}
              {activeTab === 'page_settings' && <PageSettingsPanel />}
              {activeTab === 'ai' && <AiPanel />}
              {activeTab === 'mcp' && <McpPanel />}
              {activeTab === 'public_pages' && <PublicPagesPanel />}
              {activeTab === 'library' && <LibraryPanel />}
              {activeTab === 'teamspaces' && <TeamspacesPanel workspaceName={activeWorkspace?.name} />}
              {activeTab === 'billing' && <BillingPanel />}
              {activeTab === 'plans' && <PlansPanel />}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const ProfilePanel: React.FC<{ persona: StaticPersona | null }> = ({ persona }) => (
  <>
    <Section title="Account">
      <div className="flex items-center gap-5 pb-3">
        <Avatar value={persona?.emoji} label={persona?.name} size={60} />
        <label className="w-[260px] text-xs text-[var(--color-ink-muted)]">
          <span>Preferred name</span>
          <input className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none" defaultValue={persona?.name ?? ''} />
        </label>
      </div>
      <p className="text-sm text-[var(--color-ink-muted)]"><span className="text-[var(--color-accent)]">Create a custom self-portrait</span> with osionos Faces</p>
    </Section>
    <Section title="Account security">
      <SettingRow title="Email" description={persona?.email ?? 'dev.pro.photo@gmail.com'} action={<Button>Manage emails</Button>} />
      <SettingRow title="Password" description="If you lose access to your school email address, you’ll be able to log in using your password." action={<Button>Add password</Button>} />
      <SettingRow title="Two-step verification" description="Add another layer of security to your account" action={<Button>Add verification method</Button>} />
      <SettingRow title="Passkeys" description="Sign in with on-device biometric authentication" action={<Button>Add passkey</Button>} />
    </Section>
    <Section title="Support">
      <SettingRow title="Support access" description="Grant support temporary access to troubleshoot problems. You can revoke access anytime." action={<Switch />} />
      <SettingRow danger title="Delete my account" description="Permanently delete your account and remove access to your pages and workspaces." action={<Button tone="danger">Delete my account</Button>} />
    </Section>
    <Section title="Devices">
      <SettingRow danger title="Log out of all devices" description="Log out of active sessions on all your devices, other than this one" action={<Button tone="danger">Log out of all devices</Button>} />
      <DataTable headers={['Device Name', 'Last Active', 'Location', '']} rows={[
        ['Ubuntu · This Device', 'Now', 'Madrid, ES-M, Spain', ''],
        ['Linux', 'Apr 3, 2026, 9:45 PM', 'Madrid, ES-M, Spain', <Button key="linux-apr-logout">Log out</Button>],
        ['Linux', 'Mar 29, 2026, 3:00 PM', 'Madrid, ES-M, Spain', <Button key="linux-mar-logout">Log out</Button>],
      ]} />
      <Button tone="ghost" className="mt-2"><FileDown size={14} /> Load 32 more devices</Button>
    </Section>
    <Section title="User ID">
      <SettingRow title="User ID" description={persona?.id ?? 'b0181a89-4ad8-476c-9657-352d6eadf49e'} action={<Button tone="ghost"><Copy size={15} /></Button>} />
    </Section>
  </>
);

const PreferencesPanel = () => (
  <>
    <Section title="Appearance">
      <SettingRow title="Theme" description="Choose a theme for osionos on this device" action={<SelectButton>Use system setting</SelectButton>} />
      <div className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-4">
        <WorkspaceThemeControls compact />
      </div>
    </Section>
    <Section title="Input options">
      <SettingRow title="Use Enter to add a new line" description="Applies to chat, comments, and other input fields. Press Cmd/Ctrl + Enter to send." action={<Switch />} />
    </Section>
    <Section title="Language & time">
      <SettingRow title="Language" description="Choose the language you want to use osionos in" action={<SelectButton>English (US)</SelectButton>} />
      <SettingRow title="Number format" description="Choose how numbers and currencies are formatted." action={<SelectButton>Default</SelectButton>} />
      <SettingRow title="Always show text direction controls" description="Show left-to-right and right-to-left controls in the editor." action={<Switch />} />
      <SettingRow title="Start week on Monday" description="This will affect the way your calendars appear in osionos" action={<Switch checked />} />
      <SettingRow title="Date format" description="Set the default format for new @date mentions" action={<SelectButton>Relative</SelectButton>} />
      <SettingRow title="Set time zone automatically using your location" description="Reminders, notifications, and emails will use your time zone" action={<Switch />} />
      <SettingRow title="Time zone" description="Choose your time zone" action={<SelectButton>(GMT+2:00) Madrid</SelectButton>} />
    </Section>
    <Section title="Desktop app">
      <SettingRow title="Open on start" description="Choose what page opens when you start osionos and when you switch workspaces" action={<SelectButton>Last visited page</SelectButton>} />
    </Section>
    <Section title="Privacy">
      <SettingRow title="Cookie settings" description="See the Cookie Notice for more information" action={<SelectButton>Customize</SelectButton>} />
      <SettingRow title="Show my view history" description="People with edit or full access can see when you’ve viewed a page." action={<Switch checked />} />
      <SettingRow title="Profile discoverability" description="Users who know your email will see your profile when inviting you." action={<Switch checked />} />
    </Section>
  </>
);

const GeneralPanel: React.FC<{ workspaceName?: string; workspaceId?: string; membersCount: number }> = ({ workspaceName = '42 school', workspaceId = '1edd3106-e5a4-4068-92a1-6b6e55a61ee6', membersCount }) => (
  <>
    <Section title="Workspace settings">
      <SettingRow stack title="Workspace name" description="Your workspace name can be up to 65 characters" action={<input className="w-full max-w-[400px] rounded-md border border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm outline-none" defaultValue={workspaceName} maxLength={65} />} />
      <SettingRow stack title="Icon" description="Upload an image or pick an emoji. This icon will appear in your sidebar and notifications." action={<div className="flex h-[72px] w-[72px] items-center justify-center rounded-md border border-[var(--color-line)] text-5xl">🌏</div>} />
      <SettingRow title="Custom landing page" description={<>When a new member joins this workspace, a copy of this page will be added to their <b>Private</b> pages</>} action={<SelectButton>Select page</SelectButton>} />
    </Section>
    <Section title="Sidebar">
      <SettingRow title={<span className="inline-flex items-center gap-2">Try the new sidebar <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-500">New</span></span>} description="Keep your pages, meetings, and AI within reach." action={<Switch checked />} />
      <SettingRow title="Show other osionos apps in sidebar" description="Show osionos Calendar and osionos Mail in your sidebar" action={<Switch checked />} />
    </Section>
    <Section title="Export">
      <SettingRow title="Workspace content" description={`Export all pages in ${workspaceName}. This can take longer depending on the size of the workspace.`} action={<Button>Export</Button>} />
      <SettingRow title="Members" description={`${membersCount} members available locally. Upgrade text from prompt is kept as a disabled export pattern.`} action={<Button>Export</Button>} />
    </Section>
    <Section title="Analytics">
      <SettingRow title="Save and display page view analytics" description={`Collect page view data for all pages in ${workspaceName}. Editors can see how many views it has.`} action={<Switch checked />} />
      <Button tone="ghost" className="-ml-2"><Search size={14} /> Learn more</Button>
    </Section>
    <Section title="Danger zone">
      <SettingRow danger title="Delete workspace" description="Permanently delete this workspace, including all pages and files." action={<Button tone="danger">Delete workspace</Button>} />
      <Button tone="ghost" className="-ml-2">Learn about deleting workspaces.</Button>
    </Section>
    <Section title="Workspace ID">
      <SettingRow title="Workspace ID" description={workspaceId} action={<Button tone="ghost"><Copy size={15} /></Button>} />
    </Section>
  </>
);

const NotificationsPanel = () => (
  <>
    <Section title="In-app notifications">
      <FeatureCard icon={<CalendarDays size={16} />} title="Live meeting activity" description="Join video conferencing and start transcribing. Meeting is being transcribed and summarized." action={<Switch checked />} />
    </Section>
    <Section title="Slack notifications"><SettingRow title="Slack notifications" description="Get Slack notifications about activity in your osionos workspace" action={<SelectButton>Off</SelectButton>} /></Section>
    <Section title="Discord notifications"><SettingRow title="Discord notifications" description="Get Discord notifications about activity in your osionos workspace" action={<SelectButton>Off</SelectButton>} /></Section>
    <Section title="Email notifications">
      {['Activity in my workspace', 'Always send email notifications', 'Page updates', 'Workspace digest', 'Announcements and update emails'].map((label, index) => (
        <SettingRow key={label} title={label} description={index === 2 ? 'Get email digests about pages you’ve turned on notifications for' : undefined} action={<Switch checked={index !== 1} />} />
      ))}
      <Button className="mt-3">Manage settings</Button>
      <Button tone="ghost" className="mt-3">Learn about notifications</Button>
    </Section>
  </>
);

const ConnectionsPanel = () => (
  <>
    <Section title="My connections">
      <DataTable headers={['Connection', 'Access']} rows={[
        ['ChartBase', 'Can view content'],
        ['Slack · 42born2code - dlesieur@student.42madrid.com', 'Can preview links'],
        ['GitHub (Workspace) · LESdylan', 'Can preview links'],
        ['GitHub · LESdylan', 'Can preview links and sync databases'],
        ['Whimsical · dev.pro.photo@gmail.com', 'Can preview links'],
      ]} />
    </Section>
    <Section title="Discover connections">
      <div className="grid gap-3">
        <FeatureCard icon={<Sparkles size={16} />} title="osionos AI connectors" description="Get search results, AI answers, summaries and more without leaving osionos." action={<Button>Explore</Button>} />
        <FeatureCard icon={<Bot size={16} />} title="osionos MCP" description="Connect osionos to your AI tools to summarize, search, and move faster." action={<Button>Explore</Button>} />
        <FeatureCard icon={<LayoutGrid size={16} />} title="Adobe XD" description="View Adobe XD files directly in osionos" action={<Button>Install</Button>} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><Button>See all</Button><Button>Browse connections in Gallery</Button><Button>Develop or manage connections</Button></div>
    </Section>
  </>
);

const MailCalendarPanel: React.FC<{ personaEmail?: string }> = ({ personaEmail = 'dev.pro.photo@gmail.com' }) => (
  <>
    <Section title="Connected emails"><SettingRow title="osionos Mail" description={`dylan lesieur · ${personaEmail}`} action={<Button>Add address</Button>} /></Section>
    <Section title="Connected calendars">
      <DataTable headers={['Calendar', 'Account', 'Status']} rows={[
        ['osionos Calendar', personaEmail, '2 calendars'],
        ['Holidays in Spain', personaEmail, 'Connected'],
        ['Festivos en España', 'higueraslp@gmail.com', 'Connected'],
      ]} />
      <Button className="mt-4">Add calendar</Button>
    </Section>
  </>
);

const PeoplePanel: React.FC<{ rows: React.ReactNode[][]; membersCount: number }> = ({ rows, membersCount }) => (
  <>
    <div className="flex items-center justify-between gap-3">
      <MiniTabs active="Guests" tabs={[{ label: 'Guests', count: 32 }, { label: 'Members', count: membersCount }, { label: 'Groups' }, { label: 'Contacts' }]} />
      <div className="flex gap-2"><Button tone="ghost"><Search size={16} /></Button><Button tone="primary"><UserPlus size={15} /> Add members</Button></div>
    </div>
    <DataTable headers={['User', 'Access', '']} rows={rows} />
    <Button tone="ghost">View People Directory</Button>
  </>
);

const ImportPanel = () => {
  const files = ['CSV', 'PDF', 'Text & Markdown', 'HTML', 'Word'];
  const apps = ['Asana', 'Confluence', 'Trello', 'Workflowy', 'Evernote', 'Jira', 'Monday.com', 'Quip', 'Google Docs'];
  return (
    <>
      <MiniTabs active="Discover" tabs={[{ label: 'Discover' }, { label: 'Completed' }]} />
      <Section title="Import your content">
        <div className="rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-8 text-center">
          <Upload className="mx-auto text-[var(--color-accent)]" size={28} />
          <h4 className="mt-3 font-medium text-[var(--color-ink)]">Import your content to osionos</h4>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Drag and drop ZIP, CSV, PDF, text, markdown, or HTML files, or <span className="text-[var(--color-accent)]">choose a file</span>.</p>
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">ZIP files can be a maximum of 5GB</p>
        </div>
      </Section>
      <Section title="File-based imports"><div className="grid gap-3 sm:grid-cols-2">{files.map((file) => <FeatureCard key={file} icon={<FileText size={16} />} title={file} description={`Import ${file.toLowerCase()} content from files`} />)}</div></Section>
      <Section title="Third-party imports"><div className="grid gap-3 sm:grid-cols-2">{apps.map((app) => <FeatureCard key={app} icon={<Database size={16} />} title={app} description={`Migrate content from ${app}`} />)}</div></Section>
    </>
  );
};

const PageSettingsPanel = () => (
  <>
    <Section title="Style"><div className="grid gap-2 sm:grid-cols-3">{['Default', 'Serif', 'Mono'].map((font) => <Button key={font} className="justify-start"><span className="text-base">Ag</span>{font}</Button>)}</div></Section>
    <Section title="Actions">
      {[
        ['Copy link', 'Ctrl+Alt+L', <Copy key="copy-link" size={15} />], ['Copy page contents', '', <FileText key="copy-contents" size={15} />], ['Duplicate', 'Ctrl+D', <Copy key="duplicate" size={15} />], ['Move to Trash', '', <Trash2 key="trash" size={15} />], ['Present', 'Beta · Ctrl+Alt+P', <Globe key="present" size={15} />], ['Use with AI', '', <Sparkles key="ai" size={15} />], ['Translate', '', <Globe key="translate" size={15} />], ['Import', '', <Import key="import" size={15} />], ['Export', '', <FileDown key="export" size={15} />],
      ].map(([label, shortcut, icon]) => <SettingRow key={label as string} title={<span className="inline-flex items-center gap-2">{icon}{label}</span>} description={shortcut as string} action={<Button>Open</Button>} />)}
    </Section>
    <Section title="Page switches"><SettingRow title="Small text" action={<Switch />} /><SettingRow title="Full width" action={<Switch />} /><SettingRow title="Lock page" action={<Switch />} /></Section>
    <Section title="History & connections">
      {['Updates & analytics', 'Version history', 'Notify me', 'Comments', 'Connections · None'].map((label) => <SettingRow key={label} title={label} action={<ChevronDown size={16} />} />)}
      <p className="pt-3 text-xs text-[var(--color-ink-faint)]">Word count: 34 words · Last edited by dylan lesieur · Apr 13, 2026, 8:08 PM</p>
    </Section>
  </>
);

const AiPanel = () => (
  <div className="grid gap-3">
    <FeatureCard icon={<Sparkles size={16} />} title="osionos AI" description="Upgrade to search everywhere, automate meeting notes and create summaries." action={<Button tone="primary">Upgrade</Button>} />
    {['AI connectors', 'Meeting notes', 'Agents', 'Custom agents', 'Search everywhere', 'Summaries'].map((item) => <FeatureCard key={item} title={item} description={`Configure ${item.toLowerCase()} for this workspace.`} />)}
  </div>
);

const McpPanel = () => (
  <Section title="osionos MCP">
    <FeatureCard icon={<Bot size={16} />} title="Connect osionos to AI tools" description="Summarize, search, and move faster with MCP-compatible clients." action={<Button>Explore</Button>} />
    <SettingRow title="Allowed tools" description="Search, summarize, move pages, update databases" action={<SelectButton>Workspace default</SelectButton>} />
    <SettingRow title="Developer access" description="Develop or manage connections" action={<Button>Manage</Button>} />
  </Section>
);

const PublicPagesPanel = () => (
  <>
    <Section title="osionos Sites"><FeatureCard icon={<Globe size={16} />} title="puzzled-basil-cc8.osionos.site" description="Published workspace site domain" action={<Button>Settings</Button>} /></Section>
    <Section title="Public forms"><FeatureCard title="New member here !" description="Anyone with the link · Universe42" action={<Button>Open</Button>} /></Section>
    <Section title="Shared AI chats"><SettingRow title="No shared chats" description="Shared conversations will appear here." /></Section>
    <Section title="Domains"><DataTable headers={['Domain', 'Homepage', 'Status']} rows={[[ 'puzzled-basil-cc8.osionos.site', 'Universe42', <span key="site-live" className="text-green-500">Live</span> ]]} /><Button className="mt-4">New domain</Button></Section>
    <Section title="Settings"><SettingRow title="Always indicate that a page is live as a osionos Site" action={<Switch checked />} /></Section>
  </>
);

const LibraryPanel = () => (
  <>
    <Section title="Emoji"><div className="grid gap-3 sm:grid-cols-3">{['😀', '🚀', '🌏', '🧠', '📚', '✨'].map((emoji) => <button key={emoji} type="button" className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-5 text-3xl hover:bg-[var(--color-surface-hover)]">{emoji}</button>)}</div><Button className="mt-4"><Upload size={15} /> Upload emoji</Button></Section>
    <Section title="Photos"><div className="grid gap-3 sm:grid-cols-3">{['Cover image', 'Workspace icon', 'Avatar photo'].map((item) => <FeatureCard key={item} icon={<Upload size={16} />} title={item} description="Upload, preview, and reuse media in the workspace library." />)}</div></Section>
  </>
);

const TeamspacesPanel: React.FC<{ workspaceName?: string }> = ({ workspaceName = '42 school HQ' }) => (
  <>
    <Section title="Default teamspaces"><SettingRow title={workspaceName} description="Default workspace teamspace" action={<Button>Update</Button>} /><SettingRow title="Limit teamspace creation to workspace owners" description="Allow only workspace owners to create teamspaces" action={<Switch />} /></Section>
    <Section title="Teamspaces"><p className="mb-3 text-sm text-[var(--color-ink-muted)]">Manage all teamspaces you have access to here.</p><MiniTabs active="Active" tabs={[{ label: 'Active' }, { label: 'Owner' }, { label: 'Access' }, { label: 'Security' }]} /><DataTable className="mt-4" headers={['Teamspace', 'Owners', 'Access', 'Updated']} rows={[[workspaceName, 'dylan lesieur', 'Default · 1 member • Joined', '9/11/24']]} /><Button className="mt-4">New teamspace</Button></Section>
  </>
);

const BillingPanel = () => (
  <>
    <Section title="Plan"><SettingRow title="Education Plus" description="For students & educators" action={<Button>Change plan</Button>} /></Section>
    <Section title="Payment details"><SettingRow title="Payment method" description="None" action={<Button>Edit method</Button>} /><SettingRow title="Billed to" description="None" action={<Button>Edit information</Button>} /><SettingRow title="Billing email" action={<Button>Edit email</Button>} /><SettingRow title="Invoice emails" description="Receive a copy of your invoice via email each billing period" action={<Button>Edit</Button>} /><SettingRow title="VAT/GST number" action={<Button>Edit number</Button>} /></Section>
    <Section title="Invoices"><SettingRow title="Upcoming invoice" action={<Button>View invoice</Button>} /></Section>
  </>
);

const PlansPanel = () => {
  const plans = [
    ['Free', 'Basic forms, basic sites, custom databases, osionos Calendar, osionos Mail'],
    ['Plus', 'Everything in Free, unlimited blocks, unlimited charts, custom forms, custom sites'],
    ['Business', 'Popular · osionos Agent, Custom Agents, AI Meeting Notes, database permissions, SAML SSO'],
    ['Enterprise', 'AI analytics, zero data retention, SCIM, audit log, domain management'],
  ];
  return (
    <>
      <FeatureCard title="Your current plan" description="Education Plus · For students & educators" action={<Check size={18} className="text-green-500" />} />
      <FeatureCard icon={<Sparkles size={16} />} title="osionos AI" description="Upgrade to search everywhere, automate meeting notes & more" action={<Button tone="primary">Upgrade</Button>} />
      <Section title="Compare all plans"><div className="grid gap-3 md:grid-cols-2">{plans.map(([name, description]) => <div key={name} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] p-4"><div className="flex items-center justify-between"><h4 className="font-semibold text-[var(--color-ink)]">{name}</h4>{name !== 'Free' && <span className="text-xs text-[var(--color-ink-muted)]">billed monthly</span>}</div><p className="mt-3 text-sm leading-5 text-[var(--color-ink-muted)]">{description}</p><Button className="mt-4 w-full">Upgrade</Button></div>)}</div></Section>
      <Section title="FAQ"><SettingRow title="Plans, Billing & Payment" action={<ChevronDown size={16} />} /><SettingRow title="Message support" action={<ChevronDown size={16} />} /></Section>
    </>
  );
};

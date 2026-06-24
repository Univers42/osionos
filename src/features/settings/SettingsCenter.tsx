/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SettingsCenter.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:17:01 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 13:52:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef, useState } from 'react';
// jszip / i18next / pdf-lib / qrcode are click-path only (export, language
// change, invoice PDF, 2FA QR): they are imported dynamically at their call
// sites so the settings chunk stays lean (~280KB of deps off its parse path).
import { startRegistration } from '@simplewebauthn/browser';
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
  KeyRound,
  LayoutGrid,
  Mail,
  MoreHorizontal,
  Palette,
  Plug,
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
import { useShallow } from 'zustand/react/shallow';

import { useUserStore, type StaticPersona } from '@/features/auth';
import { PermissionsPanel } from '@/features/settings/permissions';
import { ImageAvatarUpload } from '@/features/settings/profile/ImageAvatarUpload';
import { TRANSLATION_LANGUAGES, fontSampleClass, usePageActions, type PageEntry } from '@/entities/page';
import { WorkspaceThemeControls } from '@/features/theme/WorkspaceThemePanel';
import { importPageFile } from '@/services/page-actions';
import { API_BASE, api, getActiveJwt } from '@/shared/api/client';
import { useAssetLibraryStore, type AccountAsset, type AccountAssetKind } from '@/shared/config/assetLibraryStore';
import { useUIStore } from '@/shared/config/uiStore';
import { usePageStore } from '@/store/usePageStore';
import { derivePageState } from '@/store/pageStore.helpers';
import {
  MCP_TOOL_OPTIONS,
  recordSettingsAction,
  useAiSettingsStore,
  useAccountDevicesStore,
  useAccountEmailsStore,
  useAccountPasskeysStore,
  useAccountSettingsStore,
  useBillingStore,
  useConnectionsStore,
  useImportHistoryStore,
  useMcpSettingsStore,
  useNotificationSettingsStore,
  useTeamspacesStore,
  useUserPreferencesStore,
  useWorkspaceInvitesStore,
  useWorkspaceMembersStore,
  useWorkspaceSettingsStore,
  type BillingState,
  type BillingInvoice,
  type ConnectionRecord,
  type ImportHistoryEntry,
  type McpAllowedTool,
  type PublicDomain,
  type WorkspaceInvite,
  type WorkspaceMember,
  type WorkspaceMemberRole,
  type WorkspaceSettings,
} from '@/store/settings';
import { defaultBillingState, defaultWorkspaceSettings } from '@/store/settings/defaults';
import {
  Dropdown,
  EmojiPicker,
  IconValueView,
  MiniTabs as PrimitiveMiniTabs,
  Modal,
  Toggle,
  useSettingsSearchIndex,
  useToastStore,
  type SettingsSearchEntry,
  type SettingsTab,
} from '@/shared/ui';

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
  permissions: { title: 'Permissions', subtitle: 'Role × resource access matrix, field masks, and live decision testing' },
  billing: { title: 'Billing', subtitle: 'Manage billing information and view your upcoming invoice' },
  plans: { title: 'Explore plans', subtitle: 'Compare all osionos plans' },
};

const rowBorder = 'border-t border-[var(--osio-border-default)]';
const EMPTY_ASSETS: AccountAsset[] = [];
const EMPTY_BILLING_INVOICES: BillingInvoice[] = [];
const EMPTY_IMPORT_HISTORY: ImportHistoryEntry[] = [];
const EMPTY_PAGES: PageEntry[] = [];
const EMPTY_WORKSPACE_INVITES: WorkspaceInvite[] = [];
const EMPTY_WORKSPACE_MEMBERS: WorkspaceMember[] = [];

const CONNECTION_PROVIDERS = [
  { provider: 'chartbase', label: 'ChartBase', scopes: ['content.read'] },
  { provider: 'slack', label: 'Slack', scopes: ['links.preview', 'messages.notify'] },
  { provider: 'github', label: 'GitHub', scopes: ['links.preview', 'databases.sync'] },
  { provider: 'whimsical', label: 'Whimsical', scopes: ['files.preview'] },
  { provider: 'adobe-xd', label: 'Adobe XD', scopes: ['files.preview'] },
  { provider: 'mail', label: 'osionos Mail', scopes: ['mail.read'] },
  { provider: 'calendar', label: 'osionos Calendar', scopes: ['calendar.read'] },
] as const;

const FALLBACK_TIMEZONES = ['UTC', 'Europe/Madrid', 'Europe/Paris', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];

type SettingsModalName =
  | 'email-manager'
  | 'password'
  | 'two-factor'
  | 'passkeys'
  | 'support-duration'
  | 'delete-account'
  | 'revoke-devices'
  | 'cookies'
  | 'reset-preferences'
  | 'page-notification-overrides'
  | 'connection-gallery'
  | 'connection-scopes'
  | 'mail-provider'
  | 'calendar-provider'
  | 'page-selector'
  | 'delete-workspace'
  | 'invite-members'
  | 'people-directory'
  | 'member-actions'
  | 'typed-import'
  | 'provider-import'
  | 'mcp-developer'
  | 'billing-edit'
  | 'upgrade-plan'
  | 'new-teamspace'
  | 'analytics-drawer'
  | 'version-history';

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read import.'));
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read import.')));
    reader.readAsDataURL(file);
  });
}

function assetKindFromFile(file: File): AccountAssetKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

function formatBytes(value?: number): string {
  if (!value) return 'Local';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function runAsync(work: Promise<unknown>) {
  work.catch(() => undefined);
}

function runMaybeAsync(work: Promise<unknown> | void) {
  Promise.resolve(work).catch(() => undefined);
}

function noopHandledAction(label: string, metadata: Record<string, unknown> = {}) {
  recordSettingsAction(label, metadata);
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadText(fileName: string, content: string, type = 'text/plain') {
  downloadBlob(fileName, new Blob([content], { type }));
}

function csvCell(value: unknown): string {
  const primitive = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '';
  return `"${String(primitive).replaceAll('"', '""')}"`;
}

function safeSlug(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '') || 'export';
}

function timezoneOptions(): string[] {
  const supportedValuesOf = Intl.supportedValuesOf as ((key: 'timeZone') => string[]) | undefined;
  return supportedValuesOf ? supportedValuesOf('timeZone') : FALLBACK_TIMEZONES;
}

function applyTheme(theme: 'light' | 'dark' | 'system') {
  document.documentElement.dataset.osionosTheme = theme;
  recordSettingsAction('theme_apply', { theme });
}

function changeLanguage(language: string) {
  runAsync((async () => {
    const { default: i18n } = await import('i18next');
    if (i18n.isInitialized) {
      await i18n.changeLanguage(language);
      return;
    }
    recordSettingsAction('i18n_change_stub', { language, todo: 'Initialize react-i18next app provider.' });
  })());
}

async function postAccountAction<T>(path: string, body: unknown): Promise<T | null> {
  const jwt = getActiveJwt();
  if (!jwt || !API_BASE) return null;
  return api.post<T>(path, body, jwt);
}

function connectionProvider(provider: string) {
  return CONNECTION_PROVIDERS.find((item) => item.provider === provider) ?? CONNECTION_PROVIDERS[0];
}

function cookieModeLabel(mode: string | undefined) {
  if (mode === 'all') return 'Allow all';
  if (mode === 'essential') return 'Essential only';
  return 'Customize';
}

function stringPayload(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function providerConnectionInput(userId: string, provider: string, labelSuffix = '') {
  const manifest = connectionProvider(provider);
  return {
    userId,
    provider: manifest.provider,
    label: `${manifest.label}${labelSuffix}`,
    scopes: [...manifest.scopes],
  };
}

function anchorFromTitle(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('&', '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

function textFromReactNode(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textFromReactNode).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textFromReactNode(node.props.children);
  }
  return '';
}

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger' | 'ghost' }> = ({ className = '', tone = 'default', onClick, children, ...props }) => {
  const toneClass = {
    default: 'border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]',
    primary: 'bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] hover:opacity-90',
    danger: 'bg-[var(--osio-danger)]/10 text-[var(--osio-danger)] hover:bg-[var(--osio-danger)]/15',
    ghost: 'text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]',
  }[tone];

  const label = textFromReactNode(children) || props['aria-label'] || 'button';
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (onClick) {
      onClick(event);
      return;
    }
    noopHandledAction('settings_button_click', { label });
  };

  return <button type="button" className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${toneClass} ${className}`} onClick={handleClick} {...props}>{children}</button>;
};

const SelectButton: React.FC<{
  children: React.ReactNode;
  value?: string;
  options?: Array<{ value: string; label: string }>;
  onChange?: (value: string) => void;
}> = ({ children, value, options: providedOptions, onChange }) => {
  const label = textFromReactNode(children) || 'Select';
  const [localValue, setLocalValue] = useState(value ?? label);
  const options = useMemo(() => providedOptions ?? [
    { value: label, label },
    { value: 'Default', label: 'Default' },
    { value: 'Off', label: 'Off' },
  ].filter((option, index, array) => array.findIndex((candidate) => candidate.value === option.value) === index), [label, providedOptions]);
  const selectedValue = value ?? localValue;

  return <Dropdown value={selectedValue} options={options} onChange={(next) => { setLocalValue(next); if (onChange) onChange(next); else noopHandledAction('settings_select_change', { label, value: next }); }} align="end" width="auto" />;
};

const Switch: React.FC<{ checked?: boolean; label?: string; onChange?: (checked: boolean) => void }> = ({ checked = false, label, onChange }) => {
  const [localValue, setLocalValue] = useState(checked);
  const value = onChange ? checked : localValue;
  return <Toggle checked={value} onChange={(next) => { if (!onChange) { setLocalValue(next); noopHandledAction('settings_toggle_change', { label, value: next }); } onChange?.(next); }} label={label} />;
};

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`space-y-4 ${className}`} data-settings-anchor={anchorFromTitle(title)}>
    <h3 className="border-b border-[var(--osio-border-default)] pb-3 text-base font-medium text-[var(--osio-fg-default)]">{title}</h3>
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
      <div className={`text-sm font-medium ${danger ? 'text-[var(--osio-danger)]' : 'text-[var(--osio-fg-default)]'}`}>{title}</div>
      {description && <div className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">{description}</div>}
    </div>
    {action && <div className="flex shrink-0 items-center justify-end gap-2">{action}</div>}
  </div>
);

const DataTable: React.FC<{ headers: string[]; rows: React.ReactNode[][]; className?: string }> = ({ headers, rows, className = '' }) => (
  <div className={`overflow-x-auto rounded-lg border border-[var(--osio-db-line)] ${className}`}>
    <table className="w-full min-w-[560px] table-fixed text-sm">
      <thead className="bg-[var(--osio-bg-subtle)] text-left text-xs font-medium text-[var(--osio-fg-muted)]">
        <tr>{headers.map((header) => <th key={header} className="border-b border-[var(--osio-db-line)] px-3 py-2">{header}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-[var(--osio-db-line-soft)]">
        {rows.map((row) => {
          const firstCell = row[0];
          const rowKey = React.isValidElement(firstCell) && firstCell.key ? String(firstCell.key) : row.map(String).join('|');
          return (
          <tr key={rowKey} className="hover:bg-[var(--osio-bg-hover)]">
            {row.map((cell, cellIndex) => <td key={`${rowKey}-${cellIndex}`} className="px-3 py-2 align-middle text-[var(--osio-fg-default)]">{cell}</td>)}
          </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const MiniTabs: React.FC<{ tabs: Array<{ label: string; count?: number }>; active?: string; onChange?: (value: string) => void }> = ({ tabs, active, onChange }) => {
  const options = useMemo(() => tabs.map((tab) => ({ value: tab.label, label: tab.label, count: tab.count })), [tabs]);
  const [value, setValue] = useState(active ?? options[0]?.value ?? '');
  if (options.length === 0) return null;
  const selectedValue = active ?? value;
  const safeValue = options.some((option) => option.value === selectedValue) ? selectedValue : options[0].value;
  return <PrimitiveMiniTabs value={safeValue} options={options} onChange={(next) => { setValue(next); onChange?.(next); }} />;
};

const Avatar: React.FC<{ value?: string; label?: string; size?: number }> = ({ value = '👤', label, size = 28 }) => (
  <span aria-label={label} className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)]" style={{ width: size, height: size }}>
    <IconValueView value={value} size={Math.max(16, size - 8)} />
  </span>
);

const FeatureCard: React.FC<{ icon?: React.ReactNode; title: string; description: string; action?: React.ReactNode }> = ({ icon, title, description, action }) => (
  <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4">
    <div className="flex items-start gap-3">
      {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)]">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-medium text-[var(--osio-fg-default)]">{title}</h4>
        <p className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  </div>
);

function flashSavedIndicator(setSaved: React.Dispatch<React.SetStateAction<boolean>>) {
  setSaved(true);
  globalThis.setTimeout(() => setSaved(false), 1400);
}

export const SettingsCenter: React.FC<SettingsCenterProps> = ({ initialTab = 'profile', onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [settingsQuery, setSettingsQuery] = useState('');
  const activeUserId = useUserStore((s) => s.activeUserId);
  const persona = useUserStore((s) => s.activePersona());
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());
  const members = useUserStore((s) => s.personas);
  const current = prompts[activeTab];
  const searchMatches = useSettingsSearchIndex(settingsQuery);
  const settingsResults = settingsQuery.trim() ? searchMatches.slice(0, 8) : [];

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

  const memberRows = useMemo(
    () => members.slice(0, 20).map((member, index) => [
      <div key={member.id || member.email} className="flex items-center gap-3">
        <input type="checkbox" className="h-3.5 w-3.5" onChange={(event) => recordSettingsAction('fallback_member_select', { id: member.id, selected: event.target.checked })} />
        <Avatar value={member.emoji} label={member.name} />
        <div className="min-w-0">
          <div className="truncate font-medium">{member.name}</div>
          <div className="truncate text-xs text-[var(--osio-fg-muted)]">{member.email}</div>
        </div>
      </div>,
      <SelectButton key={`${member.email}-access`}>{index % 3 === 0 ? '2 pages' : '1 page'}</SelectButton>,
      <Button key={`${member.email}-menu`} tone="ghost" className="px-2"><MoreHorizontal size={16} /></Button>,
    ]),
    [members],
  );

  return (
    <Modal open onClose={onClose} title="Settings" description={current.subtitle} size="xl">
      <div className="flex h-[min(900px,94vh)] w-full overflow-hidden">
        <aside className="w-[240px] shrink-0 overflow-y-auto border-r border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)]">
          <div className="flex min-h-full flex-col justify-between">
            <div className="space-y-4 p-2">
              {tabGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-2 py-1.5 text-xs font-medium text-[var(--osio-fg-subtle)]">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${activeTab === tab.id ? 'bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]' : 'text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]'}`}
                      >
                        {tab.id === 'profile' ? <Avatar value={persona?.emoji} label={persona?.name} size={22} /> : <span className="flex h-5 w-5 items-center justify-center">{tab.icon}</span>}
                        <span className="truncate">{tab.id === 'profile' ? persona?.name ?? tab.label : tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 border-t border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4">
              <Button className="w-full" onClick={() => { recordSettingsAction('cta_click_ai', { source: 'settings_footer' }); setActiveTab('ai'); }}>
                <Sparkles size={16} /> Get osionos AI
              </Button>
            </div>
          </div>
        </aside>

        <section className="relative flex-1 overflow-hidden bg-[var(--osio-bg-surface)]" role="tabpanel" aria-label={current.title}>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-[var(--osio-z-raised)] rounded-full bg-[var(--osio-bg-subtle)] p-1.5 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
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
              {activeTab === 'mail_calendar' && <MailCalendarPanel activeUserId={activeUserId} personaEmail={persona?.email} />}
              {activeTab === 'general' && <GeneralPanel userId={activeUserId} workspaceName={activeWorkspace?.name} workspaceId={activeWorkspace?._id} membersCount={members.length} />}
              {activeTab === 'people' && <PeoplePanel workspaceId={activeWorkspace?._id} activeUserId={activeUserId} personas={members} fallbackRows={memberRows} membersCount={members.length} />}
              {activeTab === 'import' && <ImportPanel workspaceId={activeWorkspace?._id} activeUserId={activeUserId} />}
              {activeTab === 'page_settings' && <PageSettingsPanel />}
              {activeTab === 'ai' && <AiPanel />}
              {activeTab === 'mcp' && <McpPanel />}
              {activeTab === 'public_pages' && <PublicPagesPanel />}
              {activeTab === 'library' && <LibraryPanel />}
              {activeTab === 'teamspaces' && <TeamspacesPanel workspaceName={activeWorkspace?.name} />}
              {activeTab === 'permissions' && <PermissionsPanel />}
              {activeTab === 'billing' && <BillingPanel workspaceId={activeWorkspace?._id} />}
              {activeTab === 'plans' && <PlansPanel workspaceId={activeWorkspace?._id} />}
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
};

const ProfilePanel: React.FC<{ persona: StaticPersona | null }> = ({ persona }) => {
  const userId = persona?.id || 'anonymous';
  const toast = useToastStore((state) => state.push);
  const logoutUser = useUserStore((state) => state.logoutUser);
  const account = useAccountSettingsStore((state) => state.data);
  const hydrateAccount = useAccountSettingsStore((state) => state.hydrate);
  const updateAccount = useAccountSettingsStore((state) => state.update);
  const devices = useAccountDevicesStore((state) => state.data);
  const hydrateDevices = useAccountDevicesStore((state) => state.hydrate);
  const revokeDevice = useAccountDevicesStore((state) => state.revoke);
  const revokeAllExceptCurrent = useAccountDevicesStore((state) => state.revokeAllExceptCurrent);
  const passkeys = useAccountPasskeysStore((state) => state.data);
  const hydratePasskeys = useAccountPasskeysStore((state) => state.hydrate);
  const registerPasskeyOptions = useAccountPasskeysStore((state) => state.registerOptions);
  const verifyPasskeyRegistration = useAccountPasskeysStore((state) => state.verifyRegistration);
  const renamePasskey = useAccountPasskeysStore((state) => state.rename);
  const removePasskey = useAccountPasskeysStore((state) => state.remove);
  const emails = useAccountEmailsStore((state) => state.data);
  const hydrateEmails = useAccountEmailsStore((state) => state.hydrate);
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [preferredNameDraft, setPreferredNameDraft] = useState(persona?.name ?? '');
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    runAsync(hydrateAccount(userId, persona?.name));
    runAsync(hydrateDevices(userId));
    runAsync(hydratePasskeys());
    runAsync(hydrateEmails(userId, persona?.email));
  }, [hydrateAccount, hydrateDevices, hydrateEmails, hydratePasskeys, persona?.email, persona?.name, userId]);

  useEffect(() => {
    const currentName = account?.profile.preferredName ?? persona?.name ?? '';
    if (!preferredNameDraft.trim() || preferredNameDraft === currentName) return;
    const timer = globalThis.setTimeout(() => {
      updateAccount({ profile: { ...account?.profile, preferredName: preferredNameDraft.trim() } });
      flashSavedIndicator(setNameSaved);
    }, 300);
    return () => globalThis.clearTimeout(timer);
  }, [account?.profile, persona?.name, preferredNameDraft, updateAccount]);

  const preferredName = account?.profile.preferredName ?? persona?.name ?? '';
  const primaryEmail = emails.find((email) => email.isPrimary)?.email ?? persona?.email ?? 'dev.pro.photo@gmail.com';
  const security = account?.security ?? {};
  const visibleDevices = devices.filter((device) => !device.revokedAt);
  const activePasskeys = passkeys.filter((passkey) => !passkey.removedAt);
  const deviceRows = visibleDevices.map((device, index) => [
    <span key={`${device._id}-name`}>{index === 0 ? 'Ubuntu · This Device' : device.userAgent?.split(')')[0]?.replace('(', '') || 'Linux'}{device._id === 'current-device' ? <span className="ml-2 rounded bg-[var(--osio-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--osio-accent)]">Current</span> : null}</span>,
    device._id === 'current-device' ? 'Now' : new Date(device.lastActiveAt).toLocaleString(),
    device.location ?? 'Unknown location',
    device._id === 'current-device' ? '' : <Button key={`${device._id}-logout`} onClick={() => { runAsync(revokeDevice(device._id)); }}>Log out</Button>,
  ]);

  async function handleRegisterPasskey(nickname = 'osionos passkey') {
    const options = await registerPasskeyOptions(nickname);
    const response = options
      ? await startRegistration({ optionsJSON: options as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'] })
      : { id: `local-${Date.now()}`, response: { transports: ['internal'] } };
    await verifyPasskeyRegistration(response, nickname);
    toast({ kind: 'success', title: 'Passkey added' });
  }

  async function handleDeleteAccount() {
    await postAccountAction('/api/account/request-deletion', {});
    recordSettingsAction('account_request_deletion', { userId });
    logoutUser(userId);
    toast({ kind: 'success', title: 'Account scheduled for deletion in 30 days. Cancel anytime in Settings.' });
    globalThis.location.assign('/');
  }

  return (
    <>
      <Section title="Account">
        <div className="flex items-center gap-5 pb-3">
          <div className="relative">
            <button type="button" className="rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--osio-accent)]" onClick={() => setAvatarPickerOpen((open) => !open)} aria-label="Change avatar">
              <Avatar value={account?.profile.avatar ?? persona?.emoji} label={preferredName} size={60} />
            </button>
            {avatarPickerOpen && (
              <div className="absolute left-0 top-full z-[var(--osio-z-popover)] mt-2">
                <EmojiPicker
                  current={account?.profile.avatar ?? persona?.emoji}
                  onSelect={(value) => { updateAccount({ profile: { ...account?.profile, avatar: value } }); setAvatarPickerOpen(false); }}
                  onRemove={() => { updateAccount({ profile: { ...account?.profile, avatar: undefined } }); setAvatarPickerOpen(false); }}
                  onClose={() => setAvatarPickerOpen(false)}
                />
              </div>
            )}
          </div>
          <label className="w-[260px] text-xs text-[var(--osio-fg-muted)]">
            <span>Preferred name</span>
            <span className="relative mt-1 block">
              <input
                className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 pr-8 text-sm text-[var(--osio-fg-default)] outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
                value={preferredNameDraft}
                onChange={(event) => setPreferredNameDraft(event.target.value)}
              />
              {nameSaved && <Check size={16} className="absolute right-2 top-2.5 text-[var(--osio-success)]" />}
            </span>
          </label>
          <ImageAvatarUpload onUploaded={(dataUrl) => updateAccount({ profile: { ...account?.profile, avatar: dataUrl } })} />
        </div>
        <p className="text-sm text-[var(--osio-fg-muted)]"><span className="text-[var(--osio-accent)]">Create a custom self-portrait</span> with osionos Faces</p>
      </Section>
      <Section title="Account security">
        <SettingRow title="Email" description={primaryEmail} action={<Button onClick={() => setModal({ name: 'email-manager' })}>Manage emails</Button>} />
        <SettingRow title="Password" description={security.hasPassword ? 'Password sign-in is available for this account.' : 'Add a password to keep another sign-in option available.'} action={<Button onClick={() => setModal({ name: 'password' })}>{security.hasPassword ? 'Update password' : 'Add password'}</Button>} />
        <SettingRow title="Two-step verification" description="Add another layer of security to your account" action={<Button onClick={() => setModal({ name: 'two-factor' })}>{security.twoStepEnabled ? 'Manage' : 'Add verification method'}</Button>} />
        <SettingRow title="Passkeys" description={`${activePasskeys.length} passkey${activePasskeys.length === 1 ? '' : 's'} configured`} action={<Button onClick={() => setModal({ name: 'passkeys' })}><KeyRound size={14} /> Add passkey</Button>} />
      </Section>
      <Section title="Support">
        <SettingRow title="Support access" description="Grant support temporary access to troubleshoot problems. You can revoke access anytime." action={<Switch checked={Boolean(account?.supportAccessGrantedUntil)} onChange={(checked) => { if (checked) setModal({ name: 'support-duration' }); else updateAccount({ supportAccessGrantedUntil: null }); }} />} />
        <SettingRow danger title="Delete my account" description="Permanently delete your account and remove access to your pages and workspaces." action={<Button tone="danger" onClick={() => setModal({ name: 'delete-account' })}>Delete my account</Button>} />
      </Section>
      <Section title="Devices">
        <SettingRow danger title="Log out of all devices" description="Log out of active sessions on all your devices, other than this one" action={<Button tone="danger" onClick={() => setModal({ name: 'revoke-devices' })}>Log out of all devices</Button>} />
        <DataTable headers={['Device Name', 'Last Active', 'Location', '']} rows={deviceRows.length ? deviceRows : [['Ubuntu · This Device', 'Now', 'This device', '']]} />
        <Button tone="ghost" className="mt-2"><FileDown size={14} /> Load more devices</Button>
      </Section>
      <Section title="User ID">
        <SettingRow title="User ID" description={persona?.id ?? 'b0181a89-4ad8-476c-9657-352d6eadf49e'} action={<Button tone="ghost" aria-label="Copy user ID" onClick={() => { runAsync(navigator.clipboard.writeText(persona?.id ?? userId).then(() => toast({ kind: 'success', title: 'User ID copied' }))); }}><Copy size={16} /></Button>} />
      </Section>

      {modal?.name === 'email-manager' && <EmailManagerModal userId={userId} fallbackEmail={persona?.email} onClose={() => setModal(null)} />}
      {modal?.name === 'password' && <PasswordModal hasPassword={Boolean(security.hasPassword)} onSaved={() => updateAccount({ security: { ...security, hasPassword: true } })} onClose={() => setModal(null)} />}
      {modal?.name === 'two-factor' && <TwoFactorModal enabled={Boolean(security.twoStepEnabled)} onEnabled={(enabled) => updateAccount({ security: { ...security, twoStepEnabled: enabled } })} onClose={() => setModal(null)} />}
      {modal?.name === 'passkeys' && <PasskeyManagerModal passkeys={activePasskeys} onAdd={() => runAsync(handleRegisterPasskey())} onRename={renamePasskey} onRemove={(id) => runAsync(removePasskey(id))} onClose={() => setModal(null)} />}
      {modal?.name === 'support-duration' && <SupportDurationModal onSelect={(days) => { updateAccount({ supportAccessGrantedUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() }); setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.name === 'delete-account' && <TypedConfirmModal title="Delete account" message="Type DELETE to schedule this account for deletion." confirmText="DELETE" danger actionLabel="Schedule deletion" onConfirm={() => runAsync(handleDeleteAccount())} onClose={() => setModal(null)} />}
      {modal?.name === 'revoke-devices' && <ConfirmModal title="Log out all devices" message="This logs out every active session except your current device." danger actionLabel="Log out all devices" onConfirm={() => { runAsync(revokeAllExceptCurrent(userId)); setModal(null); }} onClose={() => setModal(null)} />}
    </>
  );
};

const EmailManagerModal: React.FC<{ userId: string; fallbackEmail?: string; onClose: () => void }> = ({ userId, fallbackEmail, onClose }) => {
  const emails = useAccountEmailsStore((state) => state.data);
  const addEmail = useAccountEmailsStore((state) => state.add);
  const verifyEmail = useAccountEmailsStore((state) => state.verify);
  const removeEmail = useAccountEmailsStore((state) => state.remove);
  const makePrimaryEmail = useAccountEmailsStore((state) => state.makePrimary);
  const [emailDraft, setEmailDraft] = useState('');
  const displayedEmails = emails.length ? emails : [];
  if (!displayedEmails.length && fallbackEmail) {
    displayedEmails.push({ _id: 'fallback-email', userId, email: fallbackEmail, isPrimary: true, verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), removedAt: null });
  }
  const rows = displayedEmails.map((email) => [
    <span key={`${email._id}-email`} className="font-medium">{email.email}</span>,
    email.isPrimary ? 'Primary' : 'Secondary',
    email.verifiedAt ? 'Verified' : <Button key={`${email._id}-verify`} onClick={() => runAsync(verifyEmail(email._id))}>Verify</Button>,
    <div key={`${email._id}-actions`} className="flex gap-2">
      {!email.isPrimary && <Button onClick={() => runAsync(makePrimaryEmail(email._id))}>Make primary</Button>}
      {!email.isPrimary && <Button tone="danger" onClick={() => runAsync(removeEmail(email._id))}>Remove</Button>}
    </div>,
  ]);
  return (
    <Modal open onClose={onClose} title="Manage emails" size="md">
      <div className="space-y-4">
        <DataTable headers={['Email', 'Role', 'Status', '']} rows={rows} />
        <div className="flex gap-2">
          <input className="min-w-0 flex-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} placeholder="name@example.com" />
          <Button tone="primary" onClick={() => { if (emailDraft.includes('@')) { runAsync(addEmail(emailDraft, userId)); setEmailDraft(''); } }}>Add email</Button>
        </div>
      </div>
    </Modal>
  );
};

const PasswordModal: React.FC<{ hasPassword: boolean; onSaved: () => void; onClose: () => void }> = ({ hasPassword, onSaved, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const toast = useToastStore((state) => state.push);
  const strength = Math.min(4, [nextPassword.length >= 10, /[A-Z]/.test(nextPassword), /\d/.test(nextPassword), /[^A-Za-z0-9]/.test(nextPassword)].filter(Boolean).length);
  const canSave = nextPassword.length >= 8 && nextPassword === confirmPassword && (!hasPassword || currentPassword.length > 0);
  return (
    <Modal open onClose={onClose} title={hasPassword ? 'Update password' : 'Add password'} size="sm">
      <div className="space-y-3">
        {hasPassword && <input type="password" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" />}
        <input type="password" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} placeholder="New password" />
        <input type="password" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" />
        <div className="grid grid-cols-4 gap-1">{[0, 1, 2, 3].map((index) => <span key={index} className={`h-1 rounded ${index < strength ? 'bg-[var(--osio-accent)]' : 'bg-[var(--osio-bg-muted)]'}`} />)}</div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!canSave} onClick={() => { runAsync(postAccountAction('/api/account/password', { currentPassword, nextPassword }).then(() => { onSaved(); toast({ kind: 'success', title: 'Password saved' }); onClose(); })); }}>Save password</Button>
        </div>
      </div>
    </Modal>
  );
};

const TwoFactorModal: React.FC<{ enabled: boolean; onEnabled: (enabled: boolean) => void; onClose: () => void }> = ({ enabled, onEnabled, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const toast = useToastStore((state) => state.push);
  useEffect(() => {
    if (enabled) return;
    runAsync(Promise.all([import('qrcode'), postAccountAction<{ otpauthUrl?: string }>('/api/account/2fa/enroll', {})])
      .then(([{ default: QRCode }, response]) => QRCode.toDataURL(response?.otpauthUrl ?? `otpauth://totp/osionos:${Date.now()}?secret=LOCALDEV&issuer=osionos`).then(setQrDataUrl)));
  }, [enabled]);
  return (
    <Modal open onClose={onClose} title="Two-step verification" size="sm">
      <div className="space-y-4">
        {enabled ? <p className="text-sm text-[var(--osio-fg-muted)]">Two-step verification is enabled.</p> : <>{qrDataUrl && <img alt="Two-step verification QR code" className="h-40 w-40 rounded-md border border-[var(--osio-border-default)]" src={qrDataUrl} />}<input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={code} onChange={(event) => setCode(event.target.value.replaceAll(/\D/g, '').slice(0, 6))} placeholder="6-digit code" /></>}
        {recoveryCodes.length > 0 && <div className="grid grid-cols-2 gap-2 rounded-md bg-[var(--osio-bg-subtle)] p-3 text-xs font-mono">{recoveryCodes.map((item) => <span key={item}>{item}</span>)}</div>}
        <div className="flex justify-end gap-2">
          {enabled && <Button tone="danger" onClick={() => { runAsync(postAccountAction('/api/account/2fa/disable', {}).then(() => { onEnabled(false); toast({ kind: 'success', title: 'Two-step verification disabled' }); onClose(); })); }}>Disable</Button>}
          {!enabled && <Button tone="primary" disabled={code.length !== 6} onClick={() => { runAsync(postAccountAction<{ recoveryCodes?: string[] }>('/api/account/2fa/verify', { code }).then((response) => { onEnabled(true); setRecoveryCodes(response?.recoveryCodes ?? ['A12B-C34D', 'E56F-G78H', 'J90K-L12M', 'N34P-Q56R']); toast({ kind: 'success', title: 'Two-step verification enabled' }); })); }}>Verify</Button>}
        </div>
      </div>
    </Modal>
  );
};

const PasskeyManagerModal: React.FC<{ passkeys: Array<{ _id: string; nickname?: string | null; createdAt: string }>; onAdd: () => void; onRename: (id: string, nickname: string) => void; onRemove: (id: string) => void; onClose: () => void }> = ({ passkeys, onAdd, onRename, onRemove, onClose }) => (
  <Modal open onClose={onClose} title="Passkeys" size="md">
    <div className="space-y-4">
      <DataTable headers={['Name', 'Created', '']} rows={passkeys.map((passkey) => [
        <input key={`${passkey._id}-name`} className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" defaultValue={passkey.nickname ?? 'Passkey'} onBlur={(event) => onRename(passkey._id, event.target.value)} />,
        new Date(passkey.createdAt).toLocaleDateString(),
        <Button key={`${passkey._id}-remove`} tone="danger" onClick={() => onRemove(passkey._id)}>Remove</Button>,
      ])} />
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Done</Button><Button tone="primary" onClick={onAdd}>Add passkey</Button></div>
    </div>
  </Modal>
);

const SupportDurationModal: React.FC<{ onSelect: (days: number) => void; onClose: () => void }> = ({ onSelect, onClose }) => (
  <Modal open onClose={onClose} title="Support access duration" size="sm">
    <div className="grid gap-2">
      {[1, 7, 30].map((days) => <Button key={days} onClick={() => onSelect(days)}>{days === 1 ? '1 day' : `${days} days`}</Button>)}
    </div>
  </Modal>
);

const ConfirmModal: React.FC<{ title: string; message: string; actionLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }> = ({ title, message, actionLabel, danger, onConfirm, onClose }) => (
  <Modal open onClose={onClose} title={title} size="sm">
    <div className="space-y-4">
      <p className="text-sm text-[var(--osio-fg-muted)]">{message}</p>
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone={danger ? 'danger' : 'primary'} onClick={onConfirm}>{actionLabel}</Button></div>
    </div>
  </Modal>
);

const TypedConfirmModal: React.FC<{ title: string; message: string; confirmText: string; actionLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }> = ({ title, message, confirmText, actionLabel, danger, onConfirm, onClose }) => {
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

const PreferencesPanel: React.FC<{ activeUserId: string }> = ({ activeUserId }) => {
  const userId = activeUserId || 'anonymous';
  const preferences = useUserPreferencesStore((state) => state.data);
  const hydrate = useUserPreferencesStore((state) => state.hydrate);
  const update = useUserPreferencesStore((state) => state.update);
  const reset = useUserPreferencesStore((state) => state.reset);
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);

  useEffect(() => {
    runAsync(hydrate(userId));
  }, [hydrate, userId]);

  const privacy = preferences?.privacy as { viewHistory?: boolean; profileDiscoverability?: boolean; textDirectionControls?: boolean } | undefined;
  const desktop = preferences?.desktop as { openOnStart?: string } | undefined;
  const cookies = preferences?.cookies as { mode?: string } | undefined;
  const cookieButtonLabel = cookieModeLabel(cookies?.mode);
  const timezones = useMemo(() => timezoneOptions().map((timezone) => ({ value: timezone, label: timezone.replaceAll('_', ' ') })), []);

  return (
    <>
      <Section title="Appearance">
        <SettingRow
          title="Theme"
          description="Choose a theme for osionos on this device"
          action={<SelectButton value={preferences?.theme ?? 'system'} options={[{ value: 'system', label: 'Use system setting' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={(value) => { const theme = value as 'light' | 'dark' | 'system'; applyTheme(theme); update({ theme }); }}>Use system setting</SelectButton>}
        />
        <div className="mt-4 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4">
          <WorkspaceThemeControls compact />
        </div>
      </Section>
      <Section title="Input options">
        <SettingRow title="Use Enter to add a new line" description="Applies to chat, comments, and other input fields. Press Cmd/Ctrl + Enter to send." action={<Switch checked={Boolean(preferences?.enterAddsNewline)} onChange={(checked) => update({ enterAddsNewline: checked })} />} />
      </Section>
      <Section title="Language & time">
        <SettingRow title="Language" description="Choose the language you want to use osionos in" action={<SelectButton value={preferences?.language ?? 'en-US'} options={[{ value: 'en-US', label: 'English (US)' }, { value: 'fr-FR', label: 'Français' }, { value: 'es-ES', label: 'Español' }, { value: 'de-DE', label: 'Deutsch' }]} onChange={(value) => { changeLanguage(value); update({ language: value }); }}>English (US)</SelectButton>} />
        <SettingRow title="Number format" description="Choose how numbers and currencies are formatted." action={<SelectButton value={preferences?.numberFormat ?? 'default'} options={[{ value: 'default', label: 'Default' }, { value: 'dot', label: '1,000.00' }, { value: 'comma', label: '1.000,00' }, { value: 'space', label: '1 000,00' }]} onChange={(value) => update({ numberFormat: value })}>Default</SelectButton>} />
        <SettingRow title="Always show text direction controls" description="Show left-to-right and right-to-left controls in the editor." action={<Switch checked={Boolean(preferences?.privacy?.textDirectionControls)} onChange={(checked) => update({ privacy: { ...preferences?.privacy, textDirectionControls: checked } })} />} />
        <SettingRow title="Start week" description="This will affect the way your calendars appear in osionos" action={<SelectButton value={preferences?.weekStart ?? 'monday'} options={[{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }]} onChange={(value) => update({ weekStart: value as 'sunday' | 'monday' })}>Monday</SelectButton>} />
        <SettingRow title="Date format" description="Set the default format for new @date mentions" action={<SelectButton value={preferences?.dateFormat ?? 'relative'} options={[{ value: 'relative', label: 'Relative' }, { value: 'short', label: 'Short' }, { value: 'iso', label: 'ISO' }]} onChange={(value) => update({ dateFormat: value })}>Relative</SelectButton>} />
        <SettingRow title="Set time zone automatically using your location" description="Reminders, notifications, and emails will use your time zone" action={<Switch checked={Boolean(preferences?.autoTimezone)} onChange={(checked) => update({ autoTimezone: checked, timezone: checked ? Intl.DateTimeFormat().resolvedOptions().timeZone : preferences?.timezone })} />} />
        <SettingRow title="Time zone" description="Choose your time zone" action={<SelectButton value={preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} options={timezones} onChange={(value) => update({ timezone: value, autoTimezone: false })}>Time zone</SelectButton>} />
      </Section>
      <Section title="Desktop app">
        <SettingRow title="Open on start" description="Choose what page opens when you start osionos and when you switch workspaces" action={<SelectButton value={desktop?.openOnStart ?? 'last-visited-page'} options={[{ value: 'last-visited-page', label: 'Last visited page' }, { value: 'home', label: 'Home' }, { value: 'new-page', label: 'New page' }]} onChange={(value) => update({ desktop: { ...preferences?.desktop, openOnStart: value } })}>Last visited page</SelectButton>} />
      </Section>
      <Section title="Privacy">
        <SettingRow title="Cookie settings" description="See the Cookie Notice for more information" action={<Button onClick={() => setModal({ name: 'cookies' })}>{cookieButtonLabel}</Button>} />
        <SettingRow title="Show my view history" description="People with edit or full access can see when you’ve viewed a page." action={<Switch checked={privacy?.viewHistory ?? true} onChange={(checked) => update({ privacy: { ...preferences?.privacy, viewHistory: checked } })} />} />
        <SettingRow title="Profile discoverability" description="Users who know your email will see your profile when inviting you." action={<Switch checked={privacy?.profileDiscoverability ?? true} onChange={(checked) => update({ privacy: { ...preferences?.privacy, profileDiscoverability: checked } })} />} />
        <Button className="mt-3" onClick={() => setModal({ name: 'reset-preferences' })}>Reset to defaults</Button>
      </Section>

      {modal?.name === 'cookies' && <CookieSettingsModal mode={cookies?.mode ?? 'customize'} onSave={(mode) => { update({ cookies: { ...preferences?.cookies, mode } }); setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.name === 'reset-preferences' && <ConfirmModal title="Reset preferences" message="This restores language, theme, input, privacy, and desktop preferences to their defaults." actionLabel="Reset" onConfirm={() => { runAsync(reset(userId)); setModal(null); }} onClose={() => setModal(null)} />}
    </>
  );
};

const CookieSettingsModal: React.FC<{ mode: string; onSave: (mode: string) => void; onClose: () => void }> = ({ mode, onSave, onClose }) => {
  const [analytics, setAnalytics] = useState(mode === 'all' || mode === 'customize');
  const [personalization, setPersonalization] = useState(mode === 'all');
  let nextMode = 'essential';
  if (personalization) nextMode = 'all';
  else if (analytics) nextMode = 'customize';
  return (
    <Modal open onClose={onClose} title="Cookie settings" size="sm">
      <div className="space-y-3">
        <SettingRow title="Essential cookies" description="Required for login, security, and workspace routing." action={<Switch checked label="Always on" />} />
        <SettingRow title="Analytics cookies" description="Help us understand performance and reliability." action={<Switch checked={analytics} onChange={setAnalytics} />} />
        <SettingRow title="Personalization cookies" description="Remember richer preferences across devices." action={<Switch checked={personalization} onChange={setPersonalization} />} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => onSave(nextMode)}>Save</Button></div>
      </div>
    </Modal>
  );
};

const GeneralPanel: React.FC<{ userId: string; workspaceName?: string; workspaceId?: string; membersCount: number }> = ({ userId, workspaceName = '42 school', workspaceId = '1edd3106-e5a4-4068-92a1-6b6e55a61ee6', membersCount }) => {
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
        <SettingRow stack title="Workspace name" description="Your workspace name can be up to 65 characters" action={<input className="w-full max-w-[400px] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={workspaceNameDraft} maxLength={65} onChange={(event) => setWorkspaceNameDraft(event.target.value)} />} />
        <SettingRow stack title="Icon" description="Upload an image or pick an emoji. This icon will appear in your sidebar and notifications." action={<div className="relative"><button type="button" className="flex h-[72px] w-[72px] items-center justify-center rounded-md border border-[var(--osio-border-default)] text-5xl" onClick={() => setIconPickerOpen((open) => !open)}><IconValueView value={settings.icon ?? '🌏'} size={44} /></button>{iconPickerOpen && <div className="absolute left-0 top-full z-[var(--osio-z-popover)] mt-2"><EmojiPicker current={settings.icon ?? '🌏'} onSelect={(value) => { update(resolvedUserId, workspaceId, { icon: value }); renameWorkspace(workspaceId, settings.name, value); setIconPickerOpen(false); }} onRemove={() => { update(resolvedUserId, workspaceId, { icon: undefined }); setIconPickerOpen(false); }} onClose={() => setIconPickerOpen(false)} /></div>}</div>} />
        <SettingRow title="Custom landing page" description={<>When a new member joins this workspace, a copy of this page will be added to their <b>Private</b> pages</>} action={<Button onClick={() => setModal({ name: 'page-selector' })}>{settings.landingPageId ? 'Change page' : 'Select page'}</Button>} />
      </Section>
      <Section title="Sidebar">
        <SettingRow title={<span className="inline-flex items-center gap-2">Try the new sidebar <span className="rounded bg-[var(--osio-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--osio-accent)]">New</span></span>} description="Keep your pages, meetings, and AI within reach." action={<Switch checked={sidebar.newSidebar ?? true} onChange={(checked) => { setUseNewSidebar(checked); update(resolvedUserId, workspaceId, { sidebar: { ...settings.sidebar, newSidebar: checked } }); }} />} />
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
        <SettingRow danger title="Delete workspace" description="Permanently delete this workspace, including all pages and files." action={<Button tone="danger" onClick={() => setModal({ name: 'delete-workspace' })}>Delete workspace</Button>} />
        <Button tone="ghost" className="-ml-2" onClick={() => { runAsync(reset(resolvedUserId, workspaceId, workspaceName)); }}>Reset to defaults</Button>
      </Section>
      <Section title="Workspace ID">
        <SettingRow title="Workspace ID" description={workspaceId} action={<Button tone="ghost" aria-label="Copy workspace ID" onClick={() => { runAsync(navigator.clipboard.writeText(workspaceId).then(() => toast({ kind: 'success', title: 'Workspace ID copied' }))); }}><Copy size={16} /></Button>} />
      </Section>
      {modal?.name === 'page-selector' && <PageSelectorModal pages={pages} selectedId={settings.landingPageId ?? null} onSelect={(pageId) => { update(resolvedUserId, workspaceId, { landingPageId: pageId }); setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.name === 'delete-workspace' && <TypedConfirmModal title="Delete workspace" message={`Type ${settings.name} to permanently delete this workspace.`} confirmText={settings.name} danger actionLabel="Delete workspace" onConfirm={() => runAsync(handleDeleteWorkspace())} onClose={() => setModal(null)} />}
    </>
  );
};

const PageSelectorModal: React.FC<{ pages: PageEntry[]; selectedId: string | null; onSelect: (pageId: string | null) => void; onClose: () => void }> = ({ pages, selectedId, onSelect, onClose }) => (
  <Modal open onClose={onClose} title="Select landing page" size="md">
    <div className="space-y-2">
      <Button className="w-full justify-start" onClick={() => onSelect(null)}>No landing page</Button>
      {pages.slice(0, 20).map((page) => <Button key={page._id} className={`w-full justify-start ${selectedId === page._id ? 'border-[var(--osio-accent)]' : ''}`} onClick={() => onSelect(page._id)}>{page.icon ?? '📄'} {page.title || 'Untitled'}</Button>)}
    </div>
  </Modal>
);

const NotificationsPanel: React.FC<{ activeUserId: string }> = ({ activeUserId }) => {
  const userId = activeUserId || 'anonymous';
  const settings = useNotificationSettingsStore((state) => state.data);
  const hydrate = useNotificationSettingsStore((state) => state.hydrate);
  const update = useNotificationSettingsStore((state) => state.update);
  const reset = useNotificationSettingsStore((state) => state.reset);
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);

  useEffect(() => {
    runAsync(hydrate(userId));
  }, [hydrate, userId]);

  const inApp = settings?.inApp as { liveMeetingActivity?: boolean } | undefined;
  const slack = settings?.slack as { mode?: string } | undefined;
  const discord = settings?.discord as { mode?: string } | undefined;
  const email = settings?.email as Record<string, boolean> | undefined;
  const emailRows: Array<[string, string, string | undefined]> = [
    ['Activity in my workspace', 'workspaceActivity', undefined],
    ['Always send email notifications', 'alwaysSend', undefined],
    ['Page updates', 'pageUpdates', 'Get email digests about pages you’ve turned on notifications for'],
    ['Workspace digest', 'workspaceDigest', undefined],
    ['Announcements and update emails', 'announcements', undefined],
  ];

  return (
    <>
      <Section title="In-app notifications">
        <FeatureCard icon={<CalendarDays size={16} />} title="Live meeting activity" description="Join video conferencing and start transcribing. Meeting is being transcribed and summarized." action={<Switch checked={inApp?.liveMeetingActivity ?? true} onChange={(checked) => update({ inApp: { ...settings?.inApp, liveMeetingActivity: checked } })} />} />
      </Section>
      <Section title="Slack notifications"><SettingRow title="Slack notifications" description="Get Slack notifications about activity in your osionos workspace" action={<SelectButton value={slack?.mode ?? 'off'} options={[{ value: 'off', label: 'Off' }, { value: 'mentions', label: 'Mentions only' }, { value: 'all', label: 'All activity' }]} onChange={(value) => update({ slack: { ...settings?.slack, mode: value } })}>Off</SelectButton>} /></Section>
      <Section title="Discord notifications"><SettingRow title="Discord notifications" description="Get Discord notifications about activity in your osionos workspace" action={<SelectButton value={discord?.mode ?? 'off'} options={[{ value: 'off', label: 'Off' }, { value: 'mentions', label: 'Mentions only' }, { value: 'all', label: 'All activity' }]} onChange={(value) => update({ discord: { ...settings?.discord, mode: value } })}>Off</SelectButton>} /></Section>
      <Section title="Email notifications">
        {emailRows.map(([label, key, description]) => (
          <SettingRow key={label} title={label} description={description} action={<Switch checked={email?.[key] ?? key !== 'alwaysSend'} onChange={(checked) => update({ email: { ...settings?.email, [key]: checked } })} />} />
        ))}
        <Button className="mt-3" onClick={() => reset(userId)}>Reset to defaults</Button>
        <Button tone="ghost" className="mt-3" onClick={() => setModal({ name: 'page-notification-overrides' })}>Manage settings</Button>
      </Section>
      {modal?.name === 'page-notification-overrides' && <PageNotificationOverridesModal onClose={() => setModal(null)} />}
    </>
  );
};

const PageNotificationOverridesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const pages = usePageStore(useShallow((state) => Object.values(state.pages).flat().slice(0, 8)));
  const [enabledIds, setEnabledIds] = useState(() => new Set(pages.filter((page) => page.visibility !== 'private').map((page) => page._id)));
  return (
    <Modal open onClose={onClose} title="Page notification settings" size="md">
      <div className="space-y-2">
        {pages.length === 0 ? <p className="text-sm text-[var(--osio-fg-muted)]">No pages available yet.</p> : pages.map((page) => (
          <SettingRow key={page._id} title={page.title || 'Untitled'} description={page.updatedAt ? new Date(page.updatedAt).toLocaleString() : 'No updates yet'} action={<Switch checked={enabledIds.has(page._id)} onChange={(checked) => setEnabledIds((current) => { const next = new Set(current); if (checked) { next.add(page._id); } else { next.delete(page._id); } return next; })} />} />
        ))}
        <div className="flex justify-end"><Button tone="primary" onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
};

const ConnectionsPanel: React.FC<{ activeUserId: string; personaEmail?: string }> = ({ activeUserId, personaEmail }) => {
  const userId = activeUserId || 'anonymous';
  const connections = useConnectionsStore((state) => state.data);
  const hydrate = useConnectionsStore((state) => state.hydrate);
  const connect = useConnectionsStore((state) => state.connect);
  const sync = useConnectionsStore((state) => state.sync);
  const disconnect = useConnectionsStore((state) => state.disconnect);
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);

  useEffect(() => {
    runAsync(hydrate(userId, personaEmail));
  }, [hydrate, personaEmail, userId]);

  async function connectWithDelay(provider: string) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 800));
    await connect(providerConnectionInput(userId, provider));
  }

  const rows = connections.filter((connection) => !connection.removedAt).map((connection) => [
    connection.label,
    connection.scopes.length ? connection.scopes.join(', ') : 'Can preview links',
    <div key={`${connection._id}-actions`} className="flex flex-wrap justify-end gap-2">
      <Button tone="ghost" onClick={() => { runAsync(sync(connection._id)); }}>Sync</Button>
      <Button onClick={() => setModal({ name: 'connection-scopes', payload: { connectionId: connection._id } })}>Manage scopes</Button>
      <Button tone="danger" onClick={() => setModal({ name: 'connection-scopes', payload: { connectionId: connection._id, disconnect: true } })}>Disconnect</Button>
    </div>,
  ]);
  const selectedConnection = connections.find((connection) => connection._id === modal?.payload?.connectionId);

  return (
    <>
      <Section title="My connections">
        <DataTable headers={['Connection', 'Access', '']} rows={rows.length ? rows : [['No connections yet', 'Install one from Discover connections', '']]} />
      </Section>
      <Section title="Discover connections">
        <div className="grid gap-3">
          <FeatureCard icon={<Sparkles size={16} />} title="ChartBase" description="Use charts from databases and docs without leaving osionos." action={<Button onClick={() => { runAsync(connectWithDelay('chartbase')); }}>Explore</Button>} />
          <FeatureCard icon={<Bot size={16} />} title="Slack" description="Preview threads and send notifications from pages." action={<Button onClick={() => { runAsync(connectWithDelay('slack')); }}>Install</Button>} />
          <FeatureCard icon={<LayoutGrid size={16} />} title="GitHub" description="Attach issues, pull requests, and repository previews." action={<Button onClick={() => { runAsync(connectWithDelay('github')); }}>Install</Button>} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => setModal({ name: 'connection-gallery' })}>See all</Button><Button onClick={() => setModal({ name: 'connection-gallery' })}>Browse connections in Gallery</Button><Button onClick={() => setModal({ name: 'connection-gallery', payload: { developer: true } })}>Develop or manage connections</Button></div>
      </Section>
      {modal?.name === 'connection-gallery' && <ConnectionGalleryModal onConnect={(provider) => runAsync(connectWithDelay(provider))} onClose={() => setModal(null)} />}
      {modal?.name === 'connection-scopes' && selectedConnection && modal.payload?.disconnect !== true && <ConnectionScopesModal connection={selectedConnection} onClose={() => setModal(null)} />}
      {modal?.name === 'connection-scopes' && selectedConnection && modal.payload?.disconnect === true && <ConfirmModal title="Disconnect connection" message={`Disconnect ${selectedConnection.label}?`} danger actionLabel="Disconnect" onConfirm={() => { runAsync(disconnect(selectedConnection._id)); setModal(null); }} onClose={() => setModal(null)} />}
    </>
  );
};

const ConnectionScopesModal: React.FC<{ connection: ConnectionRecord; onClose: () => void }> = ({ connection, onClose }) => (
  <Modal open onClose={onClose} title="Manage scopes" size="sm">
    <div className="space-y-3">
      {connection.scopes.map((scope) => <SettingRow key={scope} title={scope} description="Granted locally for this connection." action={<Switch checked />} />)}
      <div className="flex justify-end"><Button tone="primary" onClick={onClose}>Done</Button></div>
    </div>
  </Modal>
);

const ConnectionGalleryModal: React.FC<{ onConnect: (provider: string) => void; onClose: () => void }> = ({ onConnect, onClose }) => (
  <Modal open onClose={onClose} title="Connection gallery" size="lg">
    <div className="grid gap-3 sm:grid-cols-2">
      {CONNECTION_PROVIDERS.map((provider) => <FeatureCard key={provider.provider} title={provider.label} description={provider.scopes.join(', ')} icon={<Plug size={16} />} action={<Button onClick={() => onConnect(provider.provider)}>Install</Button>} />)}
    </div>
  </Modal>
);

const MailCalendarPanel: React.FC<{ activeUserId: string; personaEmail?: string }> = ({ activeUserId, personaEmail = 'dev.pro.photo@gmail.com' }) => {
  const userId = activeUserId || 'anonymous';
  const connections = useConnectionsStore((state) => state.data);
  const hydrate = useConnectionsStore((state) => state.hydrate);
  const connect = useConnectionsStore((state) => state.connect);
  const disconnect = useConnectionsStore((state) => state.disconnect);
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);

  useEffect(() => {
    runAsync(hydrate(userId, personaEmail));
  }, [hydrate, personaEmail, userId]);

  const mailConnections = connections.filter((connection) => connection.provider === 'mail' && !connection.removedAt);
  const calendarConnections = connections.filter((connection) => connection.provider === 'calendar' && !connection.removedAt);
  const calendarRows = calendarConnections.map((connection) => [connection.label.split(' · ')[0] ?? connection.label, personaEmail, connection.status]);

  return (
    <>
      <Section title="Connected emails">
        {mailConnections.map((connection) => <SettingRow key={connection._id} title={connection.label.split(' · ')[0]} description={connection.label.split(' · ')[1] ?? personaEmail} action={<Button tone="danger" onClick={() => runAsync(disconnect(connection._id))}>Disconnect</Button>} />)}
        <Button onClick={() => setModal({ name: 'mail-provider' })}>Add address</Button>
      </Section>
      <Section title="Connected calendars">
        <DataTable headers={['Calendar', 'Account', 'Status']} rows={calendarRows.length ? calendarRows : [['osionos Calendar', personaEmail, 'Not connected']]} />
        <Button className="mt-4" onClick={() => setModal({ name: 'calendar-provider' })}>Add calendar</Button>
      </Section>
      {modal?.name === 'mail-provider' && <ProviderPickerModal title="Mail provider" providers={['mail', 'slack']} onSelect={(provider) => { runAsync(connect(providerConnectionInput(userId, provider, ` · ${personaEmail}`))); setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.name === 'calendar-provider' && <ProviderPickerModal title="Calendar provider" providers={['calendar', 'github']} onSelect={(provider) => { runAsync(connect(providerConnectionInput(userId, provider, ` · ${personaEmail}`))); setModal(null); }} onClose={() => setModal(null)} />}
    </>
  );
};

const ProviderPickerModal: React.FC<{ title: string; providers: string[]; onSelect: (provider: string) => void; onClose: () => void }> = ({ title, providers, onSelect, onClose }) => (
  <Modal open onClose={onClose} title={title} size="sm">
    <div className="grid gap-2">
      {providers.map((provider) => {
        const manifest = connectionProvider(provider);
        return <Button key={provider} onClick={() => onSelect(provider)}>{manifest.label}</Button>;
      })}
    </div>
  </Modal>
);

type InviteRole = Exclude<WorkspaceMemberRole, 'owner'>;

const PeoplePanel: React.FC<{
  workspaceId?: string;
  activeUserId: string;
  personas: StaticPersona[];
  fallbackRows: React.ReactNode[][];
  membersCount: number;
}> = ({ workspaceId = 'local-workspace', activeUserId, personas, fallbackRows, membersCount }) => {
  const [activePeopleTab, setActivePeopleTab] = useState('Members');
  const [searchOpen, setSearchOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);
  const members = useWorkspaceMembersStore((state) => state.data[workspaceId] ?? EMPTY_WORKSPACE_MEMBERS);
  const hydrateMembers = useWorkspaceMembersStore((state) => state.hydrate);
  const changeRole = useWorkspaceMembersStore((state) => state.changeRole);
  const removeMember = useWorkspaceMembersStore((state) => state.remove);
  const invites = useWorkspaceInvitesStore((state) => state.data[workspaceId] ?? EMPTY_WORKSPACE_INVITES);
  const hydrateInvites = useWorkspaceInvitesStore((state) => state.hydrate);
  const createInvite = useWorkspaceInvitesStore((state) => state.invite);
  const revokeInvite = useWorkspaceInvitesStore((state) => state.revoke);
  const seedUserIds = useMemo(() => personas.map((persona) => persona.id).filter(Boolean), [personas]);
  const roleOptions = useMemo(() => [
    { value: 'owner', label: 'Owner' },
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
    { value: 'guest', label: 'Guest' },
  ], []);

  useEffect(() => {
    runAsync(hydrateMembers(workspaceId, activeUserId || 'anonymous', seedUserIds));
    runAsync(hydrateInvites(workspaceId));
  }, [activeUserId, hydrateInvites, hydrateMembers, seedUserIds, workspaceId]);

  const selectedMemberId = typeof modal?.payload?.userId === 'string' ? modal.payload.userId : null;
  const selectedMember = members.find((member) => member.userId === selectedMemberId);
  const visibleMembers = members.filter((member) => {
    const persona = personas.find((candidate) => candidate.id === member.userId);
    const haystack = `${persona?.name ?? ''} ${persona?.email ?? ''} ${member.userId}`.toLowerCase();
    const matchesQuery = !peopleQuery.trim() || haystack.includes(peopleQuery.trim().toLowerCase());
    let matchesTab = true;
    if (activePeopleTab === 'Members') matchesTab = member.role !== 'guest';
    if (activePeopleTab === 'Guests') matchesTab = member.role === 'guest';
    return matchesQuery && matchesTab;
  });
  const rows = visibleMembers.length ? visibleMembers.map((member) => {
    const persona = personas.find((candidate) => candidate.id === member.userId);
    return [
      <div key={member.userId} className="flex items-center gap-3">
        <input type="checkbox" className="h-3.5 w-3.5" onChange={(event) => recordSettingsAction('people_member_select', { userId: member.userId, selected: event.target.checked })} />
        <Avatar value={persona?.emoji} label={persona?.name ?? member.userId} />
        <div className="min-w-0">
          <div className="truncate font-medium">{persona?.name ?? member.userId}</div>
          <div className="truncate text-xs text-[var(--osio-fg-muted)]">{persona?.email ?? member.joinedAt}</div>
        </div>
      </div>,
      <SelectButton key={`${member.userId}-role`} value={member.role} options={roleOptions} onChange={(value) => { if (value === 'owner') setModal({ name: 'member-actions', payload: { userId: member.userId, transferOwner: true } }); else runAsync(changeRole(workspaceId, member.userId, value as WorkspaceMemberRole)); }}>{member.role}</SelectButton>,
      <Button key={`${member.userId}-menu`} tone="ghost" className="px-2" onClick={() => setModal({ name: 'member-actions', payload: { userId: member.userId } })}><MoreHorizontal size={16} /></Button>,
    ];
  }) : fallbackRows;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MiniTabs active={activePeopleTab} onChange={setActivePeopleTab} tabs={[{ label: 'Guests', count: invites.length }, { label: 'Members', count: members.length || membersCount }, { label: 'Groups' }, { label: 'Contacts' }]} />
        <div className="flex flex-wrap gap-2">
          <Button tone="ghost" onClick={() => setSearchOpen((open) => !open)}><Search size={16} /></Button>
          {searchOpen && <input value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="Search people" className="h-8 w-[220px] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" />}
          <Button tone="primary" onClick={() => setModal({ name: 'invite-members' })}><UserPlus size={16} /> Add members</Button>
        </div>
      </div>
      <DataTable headers={['User', 'Access', '']} rows={rows} />
      {invites.length > 0 && <DataTable className="mt-4" headers={['Pending invite', 'Role', '']} rows={invites.map((invite) => [invite.email, invite.role, <Button key={`${invite._id}-revoke`} tone="ghost" onClick={() => { runAsync(revokeInvite(workspaceId, invite._id)); }}>Revoke</Button>])} />}
      <Button tone="ghost" onClick={() => setModal({ name: 'people-directory' })}>View People Directory</Button>
      {modal?.name === 'invite-members' && <InviteMembersModal onInvite={(email, role) => createInvite(workspaceId, { email, role, invitedBy: activeUserId || 'anonymous' })} onClose={() => setModal(null)} />}
      {modal?.name === 'people-directory' && <PeopleDirectoryModal personas={personas} onClose={() => setModal(null)} />}
      {modal?.name === 'member-actions' && selectedMember && <MemberActionsModal onRole={(role) => { runAsync(changeRole(workspaceId, selectedMember.userId, role)); setModal(null); }} onRemove={() => { runAsync(removeMember(workspaceId, selectedMember.userId)); setModal(null); }} onClose={() => setModal(null)} transferOwner={modal.payload?.transferOwner === true} />}
    </>
  );
};

const InviteMembersModal: React.FC<{ onInvite: (email: string, role: InviteRole) => Promise<WorkspaceInvite | null>; onClose: () => void }> = ({ onInvite, onClose }) => {
  const [emailDraft, setEmailDraft] = useState('');
  const [role, setRole] = useState<InviteRole>('member');
  return (
    <Modal open onClose={onClose} title="Invite members" size="sm">
      <div className="space-y-3">
        <input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} placeholder="name@example.com" />
        <SelectButton value={role} options={[{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Admin' }, { value: 'guest', label: 'Guest' }]} onChange={(value) => setRole(value as InviteRole)}>Member</SelectButton>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => { if (emailDraft.includes('@')) runAsync(onInvite(emailDraft.trim().toLowerCase(), role).then(() => onClose())); }}>Invite</Button></div>
      </div>
    </Modal>
  );
};

const PeopleDirectoryModal: React.FC<{ personas: StaticPersona[]; onClose: () => void }> = ({ personas, onClose }) => (
  <Modal open onClose={onClose} title="People directory" size="md">
    <DataTable headers={['Person', 'Email']} rows={personas.map((persona) => [<span key={persona.id} className="inline-flex items-center gap-2"><Avatar value={persona.emoji} label={persona.name} />{persona.name}</span>, persona.email])} />
  </Modal>
);

const MemberActionsModal: React.FC<{ transferOwner?: boolean; onRole: (role: WorkspaceMemberRole) => void; onRemove: () => void; onClose: () => void }> = ({ transferOwner, onRole, onRemove, onClose }) => (
  <Modal open onClose={onClose} title={transferOwner ? 'Transfer ownership' : 'Member actions'} size="sm">
    <div className="grid gap-2">
      {transferOwner && <p className="text-sm text-[var(--osio-fg-muted)]">Confirm owner transfer before changing this role.</p>}
      <Button onClick={() => recordSettingsAction('invite_resend')}>Resend invite</Button>
      <Button onClick={() => onRole('owner')}>Transfer ownership</Button>
      <Button onClick={() => recordSettingsAction('member_view_profile')}>View profile</Button>
      <Button tone="danger" onClick={onRemove}>Remove</Button>
    </div>
  </Modal>
);

const ImportPanel: React.FC<{ workspaceId?: string; activeUserId: string }> = ({ workspaceId = 'local-workspace', activeUserId }) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [activeImportTab, setActiveImportTab] = useState('Discover');
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);
  const addAsset = useAssetLibraryStore((s) => s.addAsset);
  const addPage = usePageStore((state) => state.addPage);
  const openPage = usePageStore((state) => state.openPage);
  const jwt = useUserStore((state) => state.activePageJwt());
  const history = useImportHistoryStore((state) => state.data[workspaceId] ?? EMPTY_IMPORT_HISTORY);
  const hydrateHistory = useImportHistoryStore((state) => state.hydrate);
  const uploadImport = useImportHistoryStore((state) => state.upload);
  const addImportEntry = useImportHistoryStore((state) => state.addEntry);
  const markRetry = useImportHistoryStore((state) => state.markRetry);
  const files = ['CSV', 'PDF', 'Text & Markdown', 'HTML', 'Word'];
  const apps = ['Asana', 'Confluence', 'Trello', 'Workflowy', 'Evernote', 'Jira', 'Monday.com', 'Quip', 'Google Docs'];

  useEffect(() => {
    runAsync(hydrateHistory(workspaceId));
  }, [hydrateHistory, workspaceId]);

  async function importFiles(imports: File[]) {
    const pageExtensions = new Set(['.md', '.markdown', '.html', '.json', '.txt']);
    for (const file of imports) {
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (pageExtensions.has(extension)) {
        const payload = await importPageFile(file);
        const page = await addPage(workspaceId, payload.title || file.name, jwt ?? '', undefined, { content: payload.content });
        addImportEntry(workspaceId, { userId: activeUserId || 'anonymous', workspaceId, source: 'file', fileName: file.name, byteSize: file.size, status: 'completed', pageIds: page?._id ? [page._id] : [], error: null, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), removedAt: null });
        continue;
      }
      const source = await readFileAsDataUrl(file);
      addAsset(activeUserId, { kind: assetKindFromFile(file), name: file.name, source, origin: 'upload', mimeType: file.type, size: file.size });
      const entry = await uploadImport(workspaceId, file);
      if (!entry) addImportEntry(workspaceId, { userId: activeUserId || 'anonymous', workspaceId, source: 'file', fileName: file.name, byteSize: file.size, status: 'completed', pageIds: [], error: null, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), removedAt: null });
    }
  }

  async function handleLibraryImport(event: React.ChangeEvent<HTMLInputElement>) {
    const imports = Array.from(event.target.files ?? []);
    event.target.value = '';
    await importFiles(imports);
  }

  function handleDrop(event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    runAsync(importFiles(Array.from(event.dataTransfer.files)));
  }

  const completedRows = history
    .filter((entry) => entry.status === 'completed')
    .map((entry) => [
      entry.fileName ?? entry.source,
      formatBytes(entry.byteSize),
      entry.finishedAt ? new Date(entry.finishedAt).toLocaleString() : entry.status,
      <div key={`${entry._id}-actions`} className="flex gap-2"><Button onClick={() => { const pageId = entry.pageIds[0]; if (pageId) openPage({ id: pageId, workspaceId, kind: 'page' }); }}>Open</Button><Button tone="ghost" onClick={() => markRetry(workspaceId, entry._id)}>Retry</Button></div>,
    ]);

  if (activeImportTab === 'Completed') {
    return (
      <>
        <MiniTabs active={activeImportTab} onChange={setActiveImportTab} tabs={[{ label: 'Discover' }, { label: 'Completed', count: completedRows.length }]} />
        <Section title="Completed imports">
          <DataTable headers={['Import', 'Size', 'Finished', '']} rows={completedRows.length ? completedRows : [['No completed imports yet', 'Local', '', '']]} />
        </Section>
      </>
    );
  }

  return (
    <>
      <MiniTabs active={activeImportTab} onChange={setActiveImportTab} tabs={[{ label: 'Discover' }, { label: 'Completed', count: completedRows.length }]} />
      <Section title="Import your content">
        <button type="button" className="w-full rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-8 text-center" onClick={() => fileInputRef.current?.click()} onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
          <Upload className="mx-auto text-[var(--osio-accent)]" size={28} />
          <h4 className="mt-3 font-medium text-[var(--osio-fg-default)]">Import your content to osionos</h4>
          <p className="mt-2 text-sm text-[var(--osio-fg-muted)]">ZIP, CSV, PDF, text, markdown, HTML, images, audio, and video files.</p>
          <p className="mt-1 text-xs text-[var(--osio-fg-subtle)]">ZIP files can be a maximum of 5GB</p>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleLibraryImport} />
          <span className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-1.5 text-sm font-medium text-[var(--osio-fg-default)]"><Upload size={16} /> Choose files</span>
        </button>
      </Section>
      <Section title="File-based imports"><div className="grid gap-3 sm:grid-cols-2">{files.map((file) => <FeatureCard key={file} icon={<FileText size={16} />} title={file} description={`Import ${file.toLowerCase()} content from files`} action={<Button onClick={() => setModal({ name: 'typed-import', payload: { kind: file } })}>Open</Button>} />)}</div></Section>
      <Section title="Third-party imports"><div className="grid gap-3 sm:grid-cols-2">{apps.map((app) => <FeatureCard key={app} icon={<Database size={16} />} title={app} description={`Migrate content from ${app}`} action={<Button onClick={() => setModal({ name: 'provider-import', payload: { app } })}>Import</Button>} />)}</div></Section>
      {modal?.name === 'typed-import' && <TypedImportModal kind={stringPayload(modal.payload?.kind, 'File')} onChoose={() => fileInputRef.current?.click()} onClose={() => setModal(null)} />}
      {modal?.name === 'provider-import' && <ProviderImportModal app={stringPayload(modal.payload?.app, 'Provider')} workspaceId={workspaceId} activeUserId={activeUserId || 'anonymous'} addEntry={addImportEntry} addPage={addPage} jwt={jwt ?? ''} onClose={() => setModal(null)} />}
    </>
  );
};

const TypedImportModal: React.FC<{ kind: string; onChoose: () => void; onClose: () => void }> = ({ kind, onChoose, onClose }) => (
  <Modal open onClose={onClose} title={`${kind} import`} size="sm">
    <div className="space-y-4">
      <p className="text-sm text-[var(--osio-fg-muted)]">Choose a local file and osionos will route it to pages or the asset library based on type.</p>
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => { onChoose(); onClose(); }}>Choose file</Button></div>
    </div>
  </Modal>
);

const ProviderImportModal: React.FC<{ app: string; workspaceId: string; activeUserId: string; jwt: string; addEntry: ReturnType<typeof useImportHistoryStore.getState>['addEntry']; addPage: ReturnType<typeof usePageStore.getState>['addPage']; onClose: () => void }> = ({ app, workspaceId, activeUserId, jwt, addEntry, addPage, onClose }) => {
  const [progress, setProgress] = useState(20);
  useEffect(() => {
    const timer = globalThis.setInterval(() => setProgress((value) => Math.min(100, value + 20)), 180);
    return () => globalThis.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (progress < 100) return;
    runAsync(addPage(workspaceId, `${app} import`, jwt, undefined, { content: [{ id: `block-${Date.now()}`, type: 'paragraph', content: `${app} imported into osionos.`, children: [] }] }).then((page) => {
      addEntry(workspaceId, { userId: activeUserId, workspaceId, source: app, fileName: `${app} migration`, byteSize: 0, status: 'completed', pageIds: page?._id ? [page._id] : [], error: null, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), removedAt: null });
    }));
  }, [activeUserId, addEntry, addPage, app, jwt, progress, workspaceId]);
  return (
    <Modal open onClose={onClose} title={`${app} import`} size="sm">
      <div className="space-y-4">
        <div className="h-2 overflow-hidden rounded bg-[var(--osio-bg-muted)]"><div className="h-full bg-[var(--osio-accent)] transition-all" style={{ width: `${progress}%` }} /></div>
        <p className="text-sm text-[var(--osio-fg-muted)]">{progress >= 100 ? 'Import completed.' : 'Importing workspace content...'}</p>
        <div className="flex justify-end"><Button tone="primary" onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
};

const PageSettingsPanel = () => {
  const activePage = usePageStore((state) => state.activePage);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const actions = usePageActions(activePage?.id ?? '', activePage?.workspaceId ?? '');

  if (!activePage) {
    return <div className="rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-8 text-center text-sm text-[var(--osio-fg-muted)]">Open a page to see its settings.</div>;
  }

  function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) runMaybeAsync(actions.importFile(file));
  }

  return (
    <>
      <Section title="Style"><div className="grid gap-2 sm:grid-cols-3">{(['default', 'serif', 'mono'] as const).map((font) => <Button key={font} className={`justify-start ${actions.config.font === font ? 'border-[var(--osio-accent)]' : ''}`} onClick={() => runMaybeAsync(actions.setFont(font))}><span className={`text-base ${fontSampleClass(font)}`}>Ag</span>{font[0].toUpperCase() + font.slice(1)}</Button>)}</div></Section>
      <Section title="Actions">
        <SettingRow title={<span className="inline-flex items-center gap-2"><Copy size={16} />Copy link</span>} description="Ctrl+Alt+L" action={<Button onClick={() => runMaybeAsync(actions.copyLink())}>Copy</Button>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><FileText size={16} />Copy page contents</span>} action={<Button onClick={() => runMaybeAsync(actions.copyContents())}>Copy</Button>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Copy size={16} />Duplicate</span>} description="Ctrl+D" action={<Button onClick={() => runMaybeAsync(actions.duplicate())}>Duplicate</Button>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Trash2 size={16} />Move to Trash</span>} action={<Button tone="danger" onClick={() => runMaybeAsync(actions.moveToTrash())}>Move</Button>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Globe size={16} />Present</span>} description="Beta · Ctrl+Alt+P" action={<Switch checked={actions.config.presentationMode} onChange={() => runMaybeAsync(actions.present())} />} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Sparkles size={16} />Use with AI</span>} description="Share this page context with osionos AI." action={<Button onClick={() => recordSettingsAction('page_use_with_ai', { pageId: activePage.id })}>Use</Button>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Globe size={16} />Translate</span>} action={<div className="flex gap-2"><SelectButton value={actions.translateLocale} options={TRANSLATION_LANGUAGES.map((language) => ({ value: language.locale, label: language.label }))} onChange={actions.setTranslateLocale}>Language</SelectButton><Button onClick={() => runMaybeAsync(actions.translate())}>Translate</Button></div>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Import size={16} />Import</span>} action={<><input ref={importInputRef} type="file" accept=".json,.md,.markdown,.txt" className="hidden" onChange={handleImport} /><Button onClick={() => importInputRef.current?.click()}>Import</Button></>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><FileDown size={16} />Export</span>} action={<Button onClick={() => runMaybeAsync(actions.exportPage())}>Export</Button>} />
      </Section>
      <Section title="Page switches"><SettingRow title="Small text" action={<Switch checked={actions.config.smallText} onChange={() => runMaybeAsync(actions.toggleSmallText())} />} /><SettingRow title="Full width" action={<Switch checked={actions.config.fullWidth} onChange={() => runMaybeAsync(actions.toggleFullWidth())} />} /><SettingRow title="Lock page" action={<Switch checked={actions.config.locked} onChange={() => runMaybeAsync(actions.toggleLock())} />} /></Section>
      <Section title="History & connections">
        <SettingRow title="Updates & analytics" description={`Actions ${actions.config.analytics.actions} · Copies ${actions.config.analytics.copies}`} action={<Button onClick={actions.openAnalytics}>Open</Button>} />
        <SettingRow title="Version history" description={`${actions.versions.length} saved versions`} action={<Button onClick={actions.openVersionHistory}>Open</Button>} />
        <SettingRow title="Notify me" action={<Switch checked={actions.config.notifications.comments} onChange={() => runMaybeAsync(actions.toggleNotifications())} />} />
        <SettingRow title="Connections" description={actions.config.connections.length ? actions.config.connections.map((connection) => connection.name).join(', ') : 'None'} action={<Button onClick={() => runMaybeAsync(actions.manageConnections())}>Manage</Button>} />
        <p className="pt-3 text-xs text-[var(--osio-fg-subtle)]">Word count: {actions.wordCount} words · {actions.editedLabel}</p>
      </Section>
    </>
  );
};

const AiPanel = () => {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? 'local-workspace');
  const settings = useAiSettingsStore((state) => state.getData(workspaceId));
  const update = useAiSettingsStore((state) => state.update);
  return (
    <Section title="osionos AI">
      <FeatureCard icon={<Sparkles size={16} />} title="osionos AI" description="Search everywhere, automate meeting notes, create summaries, and run agents." action={<Button tone="primary" onClick={() => { update(workspaceId, { connectors: true, searchEverywhereIndexing: true }); recordSettingsAction('ai_upgrade_click', { workspaceId }); }}>Upgrade</Button>} />
      <SettingRow title="AI connectors" description="Let AI search connected tools from this workspace." action={<Switch checked={settings.connectors} onChange={(checked) => update(workspaceId, { connectors: checked })} />} />
      <SettingRow title="Meeting notes auto-record" description="Automatically record and summarize meetings when available." action={<Switch checked={settings.meetingNotesAutoRecord} onChange={(checked) => update(workspaceId, { meetingNotesAutoRecord: checked })} />} />
      <SettingRow title="Agents" description="Enable workspace agents." action={<Switch checked={settings.agentsEnabled} onChange={(checked) => update(workspaceId, { agentsEnabled: checked })} />} />
      <SettingRow title="Custom agents" description="Allow members to create custom agents." action={<Switch checked={settings.customAgentsAllowed} onChange={(checked) => update(workspaceId, { customAgentsAllowed: checked })} />} />
      <SettingRow title="Search everywhere indexing" description="Index pages and connected content for AI answers." action={<Switch checked={settings.searchEverywhereIndexing} onChange={(checked) => update(workspaceId, { searchEverywhereIndexing: checked })} />} />
      <SettingRow title="Summaries" description="Generate page and meeting summaries." action={<Switch checked={settings.summaries} onChange={(checked) => update(workspaceId, { summaries: checked })} />} />
    </Section>
  );
};

const McpPanel = () => {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? 'local-workspace');
  const settings = useMcpSettingsStore((state) => state.getData(workspaceId));
  const update = useMcpSettingsStore((state) => state.update);
  const toggleTool = useMcpSettingsStore((state) => state.toggleTool);
  const [developerOpen, setDeveloperOpen] = useState(false);
  return (
    <Section title="osionos MCP">
      <FeatureCard icon={<Bot size={16} />} title="Connect osionos to AI tools" description="Summarize, search, and move faster with MCP-compatible clients." action={<Switch checked={settings.connected} onChange={(checked) => update(workspaceId, { connected: checked })} />} />
      <div className="grid gap-2 rounded-lg border border-[var(--osio-border-default)] p-3">
        {MCP_TOOL_OPTIONS.map((tool) => <SettingRow key={tool.value} title={tool.label} description={tool.value} action={<Switch checked={settings.allowedTools.includes(tool.value)} onChange={() => toggleTool(workspaceId, tool.value)} />} />)}
      </div>
      <SettingRow title="Developer mode" description="Expose MCP debugging details and local command setup." action={<Switch checked={settings.developerMode} onChange={(checked) => update(workspaceId, { developerMode: checked })} />} />
      <SettingRow title="Developer access" description="Develop or manage connections" action={<Button onClick={() => setDeveloperOpen(true)}>Manage</Button>} />
      {developerOpen && <McpDeveloperModal settings={settings} onClose={() => setDeveloperOpen(false)} />}
    </Section>
  );
};

const McpDeveloperModal: React.FC<{ settings: { connected: boolean; allowedTools: McpAllowedTool[]; developerMode: boolean }; onClose: () => void }> = ({ settings, onClose }) => (
  <Modal open onClose={onClose} title="MCP developer" size="md">
    <div className="space-y-3 text-sm text-[var(--osio-fg-muted)]">
      <p>Status: {settings.connected ? 'Connected' : 'Disconnected'}</p>
      <p>Allowed tools: {settings.allowedTools.join(', ')}</p>
      <pre className="overflow-auto rounded-md bg-[var(--osio-bg-subtle)] p-3 text-xs">claude mcp get osionos</pre>
      <div className="flex justify-end"><Button tone="primary" onClick={onClose}>Done</Button></div>
    </div>
  </Modal>
);

const PublicPagesPanel = () => {
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

const LibraryPanel = () => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const activeUserId = useUserStore((s) => s.activeUserId) || 'anonymous';
  const assets = useAssetLibraryStore((s) => s.assetsByUser[activeUserId] ?? EMPTY_ASSETS);
  const addAsset = useAssetLibraryStore((s) => s.addAsset);
  const removeAsset = useAssetLibraryStore((s) => s.removeAsset);
  const imageAssets = assets.filter((asset) => asset.kind === 'cover' || asset.kind === 'image').slice(0, 9);

  async function handleLibraryUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const uploads = Array.from(event.target.files ?? []);
    event.target.value = '';
    for (const file of uploads) {
      const source = await readFileAsDataUrl(file);
      addAsset(activeUserId, {
        kind: assetKindFromFile(file),
        name: file.name,
        source,
        origin: 'upload',
        mimeType: file.type,
        size: file.size,
      });
    }
  }

  const rows = assets.map((asset) => [
    <div key={asset.id} className="flex min-w-0 items-center gap-3">
      {asset.source.startsWith('data:image') || asset.source.startsWith('http') ? (
        <img src={asset.source} alt="" className="h-10 w-14 rounded object-cover" />
      ) : (
        <span className="flex h-10 w-14 items-center justify-center rounded bg-[var(--osio-bg-subtle)]"><FileText size={16} /></span>
      )}
      <div className="min-w-0">
        <div className="truncate font-medium">{asset.name}</div>
        <div className="truncate text-xs text-[var(--osio-fg-muted)]">{asset.mimeType || asset.origin}</div>
      </div>
    </div>,
    asset.kind,
    formatBytes(asset.size),
    <Button key={`${asset.id}-remove`} tone="ghost" className="px-2" onClick={() => removeAsset(activeUserId, asset.id)}><Trash2 size={16} /></Button>,
  ]);

  return (
    <>
      <Section title="Account imports">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MiniTabs active="All" tabs={[{ label: 'All', count: assets.length }, { label: 'Images', count: imageAssets.length }, { label: 'Files' }]} />
          <div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleLibraryUpload} />
            <Button onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Add import</Button>
          </div>
        </div>
        {assets.length > 0 ? (
          <DataTable className="mt-4" headers={['Asset', 'Type', 'Size', '']} rows={rows} />
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-6 py-8 text-center text-sm text-[var(--osio-fg-muted)]">
            No imported assets yet.
          </div>
        )}
      </Section>
      <Section title="Photos">
        {imageAssets.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {imageAssets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
                <img src={asset.source} alt="" className="h-28 w-full object-cover" />
                <div className="px-3 py-2 text-xs font-medium text-[var(--osio-fg-default)]">{asset.name}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">{['Cover image', 'Workspace icon', 'Avatar photo'].map((item) => <FeatureCard key={item} icon={<Upload size={16} />} title={item} description="Reusable media for this account." />)}</div>
        )}
      </Section>
    </>
  );
};

const TeamspacesPanel: React.FC<{ workspaceName?: string }> = ({ workspaceName = '42 school HQ' }) => {
  const workspace = useUserStore((state) => state.activeWorkspace());
  const workspaceId = workspace?._id ?? 'local-workspace';
  const activeUserId = useUserStore((state) => state.activeUserId) || 'anonymous';
  const jwt = useUserStore((state) => state.activePageJwt());
  const addPage = usePageStore((state) => state.addPage);
  const teamspaces = useTeamspacesStore((state) => state.data[workspaceId] ?? []);
  const createTeamspace = useTeamspacesStore((state) => state.create);
  const updateTeamspace = useTeamspacesStore((state) => state.update);
  const archiveTeamspace = useTeamspacesStore((state) => state.archive);
  const [activeTab, setActiveTab] = useState('Active');
  const [modalOpen, setModalOpen] = useState(false);
  const [limitOwners, setLimitOwners] = useState(false);
  const activeTeamspaces = teamspaces.filter((teamspace) => !teamspace.archivedAt);
  const rows = activeTeamspaces.map((teamspace) => [
    <input key={`${teamspace._id}-name`} className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" defaultValue={teamspace.name} onBlur={(event) => updateTeamspace(workspaceId, teamspace._id, { name: event.target.value })} />,
    teamspace.owners.join(', ') || activeUserId,
    <SelectButton key={`${teamspace._id}-access`} value={teamspace.access} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'private', label: 'Private' }]} onChange={(value) => updateTeamspace(workspaceId, teamspace._id, { access: value as 'open' | 'closed' | 'private' })}>{teamspace.access}</SelectButton>,
    <Button key={`${teamspace._id}-archive`} tone="danger" onClick={() => archiveTeamspace(workspaceId, teamspace._id)}>Archive</Button>,
  ]);

  async function createNewTeamspace(name: string) {
    const page = await addPage(workspaceId, name, jwt ?? '', undefined, { icon: '🏛️', visibility: 'shared' });
    createTeamspace(workspaceId, { name, ownerId: activeUserId, pageId: page?._id ?? null });
  }

  return (
    <>
      <Section title="Default teamspaces"><SettingRow title={workspaceName} description="Default workspace teamspace" action={<Button onClick={() => recordSettingsAction('default_teamspace_update', { workspaceId })}>Update</Button>} /><SettingRow title="Limit teamspace creation to workspace owners" description="Allow only workspace owners to create teamspaces" action={<Switch checked={limitOwners} onChange={setLimitOwners} />} /></Section>
      <Section title="Teamspaces"><p className="mb-3 text-sm text-[var(--osio-fg-muted)]">Manage all teamspaces you have access to here.</p><MiniTabs active={activeTab} onChange={setActiveTab} tabs={[{ label: 'Active', count: activeTeamspaces.length }, { label: 'Owner' }, { label: 'Access' }, { label: 'Security' }]} /><DataTable className="mt-4" headers={['Teamspace', 'Owners', 'Access', '']} rows={rows.length ? rows : [[workspaceName, activeUserId, 'Default · joined', '']]} /><Button className="mt-4" onClick={() => setModalOpen(true)}>New teamspace</Button></Section>
      {modalOpen && <NewTeamspaceModal onCreate={(name) => { runAsync(createNewTeamspace(name)); setModalOpen(false); }} onClose={() => setModalOpen(false)} />}
    </>
  );
};

const NewTeamspaceModal: React.FC<{ onCreate: (name: string) => void; onClose: () => void }> = ({ onCreate, onClose }) => {
  const [name, setName] = useState('New teamspace');
  return (
    <Modal open onClose={onClose} title="New teamspace" size="sm">
      <div className="space-y-4">
        <input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={name} onChange={(event) => setName(event.target.value)} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => onCreate(name.trim() || 'New teamspace')}>Create</Button></div>
      </div>
    </Modal>
  );
};

const BillingPanel: React.FC<{ workspaceId?: string }> = ({ workspaceId = 'local-workspace' }) => {
  const storedBilling = useBillingStore((state) => state.data[workspaceId]);
  const invoices = useBillingStore((state) => state.invoices[workspaceId] ?? EMPTY_BILLING_INVOICES);
  const hydrate = useBillingStore((state) => state.hydrate);
  const update = useBillingStore((state) => state.update);
  const addInvoice = useBillingStore((state) => state.addInvoice);
  const reset = useBillingStore((state) => state.reset);
  const fallbackBilling = useMemo<BillingState>(() => defaultBillingState(workspaceId), [workspaceId]);
  const billing = storedBilling ?? fallbackBilling;
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);

  useEffect(() => {
    runAsync(hydrate(workspaceId));
  }, [hydrate, workspaceId]);

  function saveBillingEdit(value: string) {
    const field = stringPayload(modal?.payload?.field, 'billingEmail');
    if (field === 'paymentMethod') {
      update(workspaceId, { paymentMethod: { label: value } });
    } else if (field === 'billedTo') {
      update(workspaceId, { billedTo: { label: value } });
    } else if (field === 'invoiceEmails') {
      update(workspaceId, { invoiceEmails: value.split(',').map((item) => item.trim()).filter(Boolean) });
    } else {
      update(workspaceId, { [field]: value });
    }
    setModal(null);
  }

  return (
    <>
      <Section title="Plan"><SettingRow title={billing.plan} description="For students & educators" action={<SelectButton value={billing.plan} options={[{ value: 'Free', label: 'Free' }, { value: 'Education Plus', label: 'Education Plus' }, { value: 'Business', label: 'Business' }]} onChange={(value) => update(workspaceId, { plan: value })}>Change plan</SelectButton>} /></Section>
      <Section title="Payment details">
        <SettingRow title="Payment method" description={billing.paymentMethod ? 'Configured' : 'None'} action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'paymentMethod', label: 'Payment method' } })}>Edit method</Button>} />
        <SettingRow title="Billed to" description={billing.billedTo ? 'Configured' : 'None'} action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'billedTo', label: 'Billed to' } })}>Edit information</Button>} />
        <SettingRow title="Billing email" description={billing.billingEmail ?? 'None'} action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'billingEmail', label: 'Billing email' } })}>Edit email</Button>} />
        <SettingRow title="Invoice emails" description="Receive a copy of your invoice via email each billing period" action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'invoiceEmails', label: 'Invoice emails' } })}>Edit</Button>} />
        <SettingRow title="VAT/GST number" description={billing.vatNumber ?? 'None'} action={<Button onClick={() => setModal({ name: 'billing-edit', payload: { field: 'vatNumber', label: 'VAT/GST number' } })}>Edit number</Button>} />
      </Section>
      <Section title="Invoices">
        <SettingRow title="Upcoming invoice" description={billing.upcomingInvoice ? 'Ready to review' : 'No upcoming invoice'} action={<Button onClick={() => runAsync(downloadInvoicePdf(addInvoice(workspaceId, { amount: 0, status: 'open' })))}>View invoice</Button>} />
        {invoices.length > 0 && <DataTable className="mt-4" headers={['Invoice', 'Amount', 'Status', '']} rows={invoices.map((invoice) => [invoice.number, `${invoice.amount} ${invoice.currency}`, invoice.status, <Button key={`${invoice._id}-view`} onClick={() => runAsync(downloadInvoicePdf(invoice))}>View invoice</Button>])} />}
        <Button className="mt-3" onClick={() => reset(workspaceId)}>Reset to defaults</Button>
      </Section>
      {modal?.name === 'billing-edit' && <BillingEditModal label={stringPayload(modal.payload?.label, 'Billing')} onSave={saveBillingEdit} onClose={() => setModal(null)} />}
    </>
  );
};

async function downloadInvoicePdf(invoice: BillingInvoice) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('osionos invoice', { x: 56, y: 780, size: 24, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(invoice.number, { x: 56, y: 744, size: 14, font });
  page.drawText(`${invoice.amount} ${invoice.currency} · ${invoice.status}`, { x: 56, y: 720, size: 12, font });
  const bytes = await pdf.save();
  downloadBlob(`${invoice.number}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
}

const BillingEditModal: React.FC<{ label: string; onSave: (value: string) => void; onClose: () => void }> = ({ label, onSave, onClose }) => {
  const [value, setValue] = useState('');
  return (
    <Modal open onClose={onClose} title={label} size="sm">
      <div className="space-y-4">
        <input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={value} onChange={(event) => setValue(event.target.value)} placeholder={label} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => onSave(value)}>Save</Button></div>
      </div>
    </Modal>
  );
};

const PlansPanel: React.FC<{ workspaceId?: string }> = ({ workspaceId = 'local-workspace' }) => {
  const storedBilling = useBillingStore((state) => state.data[workspaceId]);
  const hydrate = useBillingStore((state) => state.hydrate);
  const update = useBillingStore((state) => state.update);
  const fallbackBilling = useMemo<BillingState>(() => defaultBillingState(workspaceId), [workspaceId]);
  const billing = storedBilling ?? fallbackBilling;
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  const plans = [
    ['Free', 'Basic forms, basic sites, custom databases, osionos Calendar, osionos Mail'],
    ['Plus', 'Everything in Free, unlimited blocks, unlimited charts, custom forms, custom sites'],
    ['Business', 'Popular · osionos Agent, Custom Agents, AI Meeting Notes, database permissions, SAML SSO'],
    ['Enterprise', 'AI analytics, zero data retention, SCIM, audit log, domain management'],
  ];

  useEffect(() => {
    runAsync(hydrate(workspaceId));
  }, [hydrate, workspaceId]);

  return (
    <>
      <FeatureCard title="Your current plan" description={`${billing.plan} · For students & educators`} action={<Check size={18} className="text-[var(--osio-accent)]" />} />
      <FeatureCard icon={<Sparkles size={16} />} title="osionos AI" description="Upgrade to search everywhere, automate meeting notes & more" action={<Button tone="primary" onClick={() => setUpgradePlan('AI')}>Upgrade</Button>} />
      <Section title="Compare all plans"><div className="grid gap-3 md:grid-cols-2">{plans.map(([name, description]) => <div key={name} className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4"><div className="flex items-center justify-between"><h4 className="font-semibold text-[var(--osio-fg-default)]">{name}</h4>{name !== 'Free' && <span className="text-xs text-[var(--osio-fg-muted)]">billed monthly</span>}</div><p className="mt-3 text-sm leading-5 text-[var(--osio-fg-muted)]">{description}</p><Button className="mt-4 w-full" onClick={() => setUpgradePlan(name)}>Upgrade</Button></div>)}</div></Section>
      <Section title="FAQ"><SettingRow title="Plans, Billing & Payment" action={<ChevronDown size={16} />} /><SettingRow title="Message support" action={<ChevronDown size={16} />} /></Section>
      {upgradePlan && <UpgradePlanModal plan={upgradePlan} onConfirm={() => { update(workspaceId, { plan: upgradePlan }); useToastStore.getState().push({ kind: 'success', title: 'accountUpgraded' }); setUpgradePlan(null); }} onClose={() => setUpgradePlan(null)} />}
    </>
  );
};

const UpgradePlanModal: React.FC<{ plan: string; onConfirm: () => void; onClose: () => void }> = ({ plan, onConfirm, onClose }) => (
  <Modal open onClose={onClose} title="Upgrade plan" size="sm">
    <div className="space-y-4">
      <p className="text-sm text-[var(--osio-fg-muted)]">Upgrade this workspace to {plan}.</p>
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={onConfirm}>Upgrade</Button></div>
    </div>
  </Modal>
);

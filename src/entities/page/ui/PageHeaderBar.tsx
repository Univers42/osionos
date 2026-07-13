/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageHeaderBar.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Check,
  Clipboard,
  Clock,
  Copy,
  Activity,
  AlertTriangle,
  Bug,
  Download,
  Grid3X3,
  History,
  Import,
  Info,
  Languages,
  Link,
  Lock,
  Code2,
  Maximize2,
  MoreHorizontal,
  PaintBucket,
  Plug,
  Presentation,
  Ruler,
  Search,
  Square,
  Text,
  TextCursor,
  Trash2,
} from 'lucide-react';
import { LayoutDashboard } from 'lucide-react';
import { PAGE_DEBUG_TOOLS, usePageDebugStore, type PageDebugToolId } from '@/shared/debug/pageDebugStore';

import {
  TRANSLATION_LANGUAGES,
  fontSampleClass,
  usePageActions,
} from '@/entities/page';
import type { PageConfig, PageFont, PageVersion } from '@/shared/config/pageConfigStore';
import { useClickOutside, useEscapeKey, useToastStore } from '@/shared/ui';
import { usePageStore } from '@/store/usePageStore';

import { PageBreadcrumbs } from './PageBreadcrumbs';
import { PageShareButton } from './PageShareButton';
import { PageFavoriteButton } from './PageFavoriteButton';
import { PageCommentsButton } from '@/features/comments/ui/PageCommentsButton';

interface PageHeaderBarProps {
  pageId: string;
  workspaceId: string;
}

interface MenuButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  checked?: boolean;
  destructive?: boolean;
  shortcut?: string;
  trailing?: string;
  badge?: string;
}

const FONT_OPTIONS: Array<{ id: PageFont; label: string; sample: string }> = [
  { id: 'default', label: 'Default', sample: 'Ag' },
  { id: 'serif', label: 'Serif', sample: 'Ag' },
  { id: 'mono', label: 'Mono', sample: 'Ag' },
];

const ACTION_LABELS = [
  'remove header canvas',
  'copy link',
  'copy page contents',
  'duplicate',
  'move to trash',
  'present',
  'small text',
  'full width',
  'lock page',
  'translate',
  'import',
  'export',
  'updates analytics',
  'version history',
  'notify me',
  'connections',
];

const DEBUG_TOOL_ICONS: Record<PageDebugToolId, React.ReactNode> = {
  outlines: <Square size={16} />,
  surfaces: <PaintBucket size={16} />,
  grid: <Grid3X3 size={16} />,
  blockInfo: <Info size={16} />,
  overflow: <AlertTriangle size={16} />,
  measure: <Ruler size={16} />,
  caret: <TextCursor size={16} />,
  perf: <Activity size={16} />,
};

const MenuButton: React.FC<MenuButtonProps> = ({ icon, label, onClick, checked, destructive, shortcut, trailing, badge }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex min-h-8 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--osio-bg-hover)] ${destructive ? 'text-[var(--osio-danger)]' : ''}`}
  >
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--osio-fg-muted)]">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {badge && <span className="rounded bg-[var(--osio-bg-muted)] px-1.5 py-0.5 text-xs text-[var(--osio-fg-muted)]">{badge}</span>}
    {shortcut && <span className="text-xs text-[var(--osio-fg-subtle)]">{shortcut}</span>}
    {trailing && <span className="max-w-20 truncate text-xs text-[var(--osio-fg-subtle)]">{trailing}</span>}
    {checked && <Check size={14} className="shrink-0 text-[var(--osio-accent)]" />}
  </button>
);

const AnalyticsPanel: React.FC<{ config: PageConfig }> = ({ config }) => (
  <div className="border-t border-[var(--osio-border-default)] px-3 py-2 text-xs text-[var(--osio-fg-muted)]">
    <p className="mb-1 font-medium text-[var(--osio-fg-default)]">Updates & analytics</p>
    <div className="grid grid-cols-2 gap-1">
      <span>Actions: {config.analytics.actions}</span>
      <span>Copies: {config.analytics.copies}</span>
      <span>Imports: {config.analytics.imports}</span>
      <span>Exports: {config.analytics.exports}</span>
      <span>Translations: {config.analytics.translations}</span>
      <span>Versions: {config.versions.length}</span>
    </div>
  </div>
);

const VersionsPanel: React.FC<{ versions: PageVersion[]; onRestore: (version: PageVersion) => void; onSave: () => void }> = ({ versions, onRestore, onSave }) => (
  <div className="border-t border-[var(--osio-border-default)] px-3 py-2 text-xs text-[var(--osio-fg-muted)]">
    <div className="mb-1.5 flex items-center justify-between">
      <p className="font-medium text-[var(--osio-fg-default)]">Version history</p>
      <button type="button" onClick={onSave} className="rounded border border-[var(--osio-border-default)] px-2 py-0.5 font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]">Save version</button>
    </div>
    {versions.length === 0 ? <p>No version saved yet — edits autosave, or click “Save version”.</p> : (
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {versions.map((version) => (
          <button key={version.id} type="button" title="Restore this version" onClick={() => onRestore(version)} className="w-full rounded px-2 py-1 text-left hover:bg-[var(--osio-bg-hover)]">
            <span className="block text-[var(--osio-fg-default)]">{version.label}</span>
            <span>{new Date(version.createdAt).toLocaleString()}</span>
          </button>
        ))}
      </div>
    )}
  </div>
);

function actionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Page action failed.';
}

function runPageAction(work: Promise<unknown> | void, onError: (message: string) => void) {
  Promise.resolve(work).catch((error) => onError(actionErrorMessage(error)));
}

function openPageActionsHome() {
  usePageStore.setState({ activePage: null, showTrash: false, navigationPath: [] });
}

export const PageHeaderBar: React.FC<PageHeaderBarProps> = ({ pageId, workspaceId }) => {
  const actions = usePageActions(pageId, workspaceId);
  const debugToolsEnabled = usePageDebugStore((s) => s.enabled);
  const toggleDebugTool = usePageDebugStore((s) => s.toggle);
  const [configOpen, setConfigOpen] = useState(false);
  const [actionQuery, setActionQuery] = useState('');
  const pushToast = useToastStore((state) => state.push);
  const importInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBoundaryRefs = useMemo(() => [triggerRef, menuRef] as const, []);
  const normalizedQuery = actionQuery.trim().toLowerCase();
  const hasActionMatch = useMemo(() => !normalizedQuery || ACTION_LABELS.some((label) => label.includes(normalizedQuery)), [normalizedQuery]);

  const closeConfig = useCallback(() => setConfigOpen(false), []);
  useClickOutside(menuBoundaryRefs, closeConfig, configOpen);
  useEscapeKey(closeConfig, configOpen);

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) runPageAction(actions.importFile(file), showActionError);
  }

  function showActionError(message: string) {
    pushToast({ kind: 'error', title: message });
  }

  return (
    <div className="sticky top-0 z-[var(--osio-z-raised)] flex h-11 w-full items-center border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
      <div className="flex w-full items-center justify-between px-4">
        <div className="min-w-0 flex-1 overflow-hidden">
          <PageBreadcrumbs pageId={pageId} onOpenHome={openPageActionsHome} />
        </div>

        <div className="flex shrink-0 items-center gap-3 pl-4">
          <span className="hidden whitespace-nowrap text-sm text-[var(--osio-fg-subtle)] sm:inline">{actions.editedLabel}</span>
          <PageFavoriteButton pageId={pageId} />
          <PageCommentsButton pageId={pageId} />
          <PageShareButton pageId={pageId} workspaceId={workspaceId} />
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setConfigOpen((open) => !open)}
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
              aria-label="Open page configuration"
            >
              <MoreHorizontal size={18} />
            </button>
            {configOpen && (
              <div ref={menuRef} className="absolute right-0 top-full z-[var(--osio-z-popover)] mt-2 max-h-[80vh] w-72 overflow-y-auto rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-2 shadow-[var(--osio-shadow-menu)]">
                <div className="px-3 pb-2">
                  <div className="flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2">
                    <Search size={14} className="text-[var(--osio-fg-muted)]" />
                    <input value={actionQuery} onChange={(event) => setActionQuery(event.target.value)} placeholder="Search actions..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                  </div>
                </div>

                {hasActionMatch && (
                  <>
                    <div className="grid grid-cols-3 gap-1 px-3 pb-2">
                      {FONT_OPTIONS.map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => runPageAction(actions.setFont(font.id), showActionError)}
                          className={`rounded-md px-2 py-2 text-center hover:bg-[var(--osio-bg-hover)] ${actions.config.font === font.id ? 'text-[var(--osio-accent)]' : ''}`}
                        >
                          <span className={`block text-xl ${fontSampleClass(font.id)}`}>{font.sample}</span>
                          <span className="text-xs">{font.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="border-t border-[var(--osio-border-default)] py-1">
                      <MenuButton icon={<Link size={16} />} label="Copy link" onClick={() => runPageAction(actions.copyLink(), showActionError)} />
                      <MenuButton icon={<Clipboard size={16} />} label="Copy page contents" onClick={() => runPageAction(actions.copyContents(), showActionError)} />
                      <MenuButton icon={<Copy size={16} />} label="Duplicate" shortcut="Ctrl+D" onClick={() => runPageAction(actions.duplicate(), showActionError)} />
                      <MenuButton icon={<Trash2 size={16} />} label="Move to Trash" destructive onClick={() => runPageAction(actions.moveToTrash(), showActionError)} />
                    </div>

                    <div className="border-t border-[var(--osio-border-default)] py-1">
                      <MenuButton icon={<Presentation size={16} />} label="Present" shortcut="Ctrl+Alt+P" checked={actions.config.presentationMode} badge="Beta" onClick={() => runPageAction(actions.present(), showActionError)} />
                      <MenuButton icon={<Text size={16} />} label="Small text" checked={actions.config.smallText} onClick={() => runPageAction(actions.toggleSmallText(), showActionError)} />
                      <MenuButton icon={<Maximize2 size={16} />} label="Full width" checked={actions.config.fullWidth} onClick={() => runPageAction(actions.toggleFullWidth(), showActionError)} />
                      <MenuButton icon={<Lock size={16} />} label="Lock page" checked={actions.config.locked} onClick={() => runPageAction(actions.toggleLock(), showActionError)} />
                      <MenuButton icon={<Code2 size={16} />} label="Raw / code mode" checked={actions.config.rawMode} onClick={() => runPageAction(actions.toggleRawMode(), showActionError)} />
                      {actions.hasRemovableHeader && (
                        <MenuButton
                          icon={<LayoutDashboard size={16} />}
                          label="Remove header canvas"
                          onClick={() => runPageAction(actions.removeHeaderCanvas(), showActionError)}
                        />
                      )}
                      <div className="flex min-h-9 items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--osio-bg-hover)]">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--osio-fg-muted)]"><Languages size={16} /></span>
                        <span className="min-w-0 flex-1 truncate">Translate</span>
                        <select value={actions.translateLocale} className="max-w-28 rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-1.5 py-1 text-xs text-[var(--osio-fg-default)] outline-none" onChange={(event) => actions.setTranslateLocale(event.target.value)}>
                          {TRANSLATION_LANGUAGES.map((language) => <option key={language.locale} value={language.locale}>{language.label}</option>)}
                        </select>
                        <button type="button" className="rounded bg-[var(--osio-accent)] px-2 py-1 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90" onClick={() => runPageAction(actions.translate(actions.translateLocale), showActionError)}>Apply</button>
                      </div>
                    </div>

                    <div className="border-t border-[var(--osio-border-default)] py-1">
                      <input ref={importInputRef} type="file" accept=".json,.md,.markdown,.txt" className="hidden" onChange={handleImportFile} />
                      <MenuButton icon={<Import size={16} />} label="Import" onClick={() => importInputRef.current?.click()} />
                      <MenuButton icon={<Download size={16} />} label="Export" onClick={() => runPageAction(actions.exportPage(), showActionError)} />
                    </div>

                    <div className="border-t border-[var(--osio-border-default)] py-1">
                      <MenuButton icon={<Clock size={16} />} label="Updates & analytics" onClick={actions.openAnalytics} />
                      <MenuButton icon={<History size={16} />} label="Version history" onClick={actions.openVersionHistory} />
                      <MenuButton icon={<Bell size={16} />} label="Notify me" checked={actions.config.notifications.comments} trailing="Comments" onClick={() => runPageAction(actions.toggleNotifications(), showActionError)} />
                      <MenuButton icon={<Plug size={16} />} label="Connections" trailing={actions.config.connections.length ? 'MongoDB' : 'None'} checked={actions.config.connections.length > 0} onClick={() => runPageAction(actions.manageConnections(), showActionError)} />
                    </div>

                    {/* Debug tools: layout/edit diagnostics; toggles keep the menu
                        open so several can be flipped in one visit, and persist. */}
                    <div className="border-t border-[var(--osio-border-default)] py-1">
                      <div className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">
                        <Bug size={11} className="shrink-0" />
                        Tools
                      </div>
                      {PAGE_DEBUG_TOOLS.map((tool) => (
                        <div key={tool.id} data-testid={`debug-tool-${tool.id}`} title={tool.hint}>
                          <MenuButton
                            icon={DEBUG_TOOL_ICONS[tool.id]}
                            label={tool.label}
                            checked={!!debugToolsEnabled[tool.id]}
                            onClick={() => toggleDebugTool(tool.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {actions.detailPanel === 'analytics' && <AnalyticsPanel config={actions.config} />}
                {actions.detailPanel === 'versions' && <VersionsPanel versions={actions.versions} onRestore={(version) => runPageAction(actions.restoreVersion(version), showActionError)} onSave={() => runPageAction(actions.saveVersion(), showActionError)} />}

                <div className="border-t border-[var(--osio-border-default)] px-3 py-2 text-xs text-[var(--osio-fg-subtle)]">
                  <p>Word count: {actions.wordCount} words</p>
                  <p>Last action: {actions.actionMessage ?? actions.config.lastAction?.action ?? 'None'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
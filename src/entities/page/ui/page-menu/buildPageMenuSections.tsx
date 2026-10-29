import React from 'react';
import {
  Bell,
  BookOpen,
  Clipboard,
  Clock,
  Code2,
  Copy,
  Download,
  History,
  Import,
  Languages,
  LayoutDashboard,
  ListTree,
  Link,
  Lock,
  MoveRight,
  Palette,
  Plug,
  Presentation,
  Rows3,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { PAGE_DEBUG_TOOLS, usePageDebugStore, type PageDebugToolId } from '@/shared/debug/pageDebugStore';
import { AlertTriangle, Activity, Bug, Grid3X3, Info, PaintBucket, Ruler, Square, TextCursor } from 'lucide-react';
import type { ReturnTypeOfUsePageActions } from './actionTypes';
import type { PageMenuSection } from './types';

export interface PageMenuContext {
  actions: ReturnTypeOfUsePageActions;
  pageSurface: string | undefined;
  canToggleWiki: boolean;
  toggleWiki: () => void;
  canDashboard: boolean;
  onImport: () => void;
  onMoveTo: () => void;
  onUseAI: () => void;
  onOpenAppearance: () => void;
  onError: (message: string) => void;
  onClose: () => void;
  debugTools: Partial<Record<PageDebugToolId, boolean>>;
}

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

/** Builds every row of the page menu, wrapped so a click either closes the menu
 *  or (toggles, detail panels) leaves it open. */
export function buildPageMenuSections(context: PageMenuContext): PageMenuSection[] {
  const { actions, onClose, onError } = context;
  const run = (work: () => Promise<unknown> | void, keepOpen = false) => () => {
    try {
      const result = work();
      if (result instanceof Promise) result.catch((error: unknown) => onError(error instanceof Error && error.message ? error.message : 'Page action failed.'));
    } catch (error) {
      onError(error instanceof Error && error.message ? error.message : 'Page action failed.');
    }
    if (!keepOpen) onClose();
  };

  const page = [
    { id: 'copy-link', label: 'Copy link', icon: <Link size={16} />, run: run(() => actions.copyLink()) },
    { id: 'duplicate', label: 'Duplicate', icon: <Copy size={16} />, shortcut: 'Ctrl+D', run: run(() => actions.duplicate()) },
    { id: 'move-to', label: 'Move to', icon: <MoveRight size={16} />, run: run(() => context.onMoveTo()) },
    { id: 'version-history', label: 'Version history', icon: <History size={16} />, keepOpen: true, run: run(() => actions.openVersionHistory(), true) },
  ];

  const fonts = [
    { id: 'font-default', label: 'Default', font: 'default' as const, checked: actions.config.font === 'default' },
    { id: 'font-serif', label: 'Serif', font: 'serif' as const, checked: actions.config.font === 'serif' },
    { id: 'font-mono', label: 'Mono', font: 'mono' as const, checked: actions.config.font === 'mono' },
  ].map((font) => ({
    id: font.id,
    label: font.label,
    icon: <Palette size={16} />,
    font: font.font,
    checked: font.checked,
    keepOpen: true,
    run: run(() => actions.setFont(font.font), true),
  }));

  const appearance = [
    { id: 'small-text', label: 'Small text', icon: <Clipboard size={16} />, checked: actions.config.smallText, toggle: true, keepOpen: true, run: run(() => actions.toggleSmallText(), true) },
    { id: 'full-width', label: 'Full width', icon: <LayoutDashboard size={16} />, checked: actions.config.fullWidth, toggle: true, keepOpen: true, run: run(() => actions.toggleFullWidth(), true) },
    { id: 'table-of-contents', label: 'Table of contents', icon: <ListTree size={16} />, checked: actions.config.showOutline, toggle: true, keepOpen: true, run: run(() => actions.toggleOutline(), true) },
    { id: 'page-properties', label: 'Page properties', icon: <Rows3 size={16} />, checked: actions.config.showProperties, toggle: true, keepOpen: true, run: run(() => actions.toggleProperties(), true) },
  ];

  const more = [
    { id: 'copy-contents', label: 'Copy page contents', icon: <Clipboard size={16} />, run: run(() => actions.copyContents()) },
    { id: 'present', label: 'Present', icon: <Presentation size={16} />, shortcut: 'Ctrl+Alt+P', badge: 'Beta', checked: actions.config.presentationMode, keepOpen: true, run: run(() => actions.present(), true) },
    ...(context.canToggleWiki ? [{
      id: 'toggle-wiki',
      label: context.pageSurface === 'wiki' ? 'Turn into page' : 'Turn into wiki',
      icon: <BookOpen size={16} />,
      run: run(() => context.toggleWiki()),
    }] : []),
    { id: 'raw-mode', label: 'Raw / code mode', icon: <Code2 size={16} />, checked: actions.config.rawMode, run: run(() => actions.toggleRawMode()) },
    ...(actions.hasRemovableHeader ? [{ id: 'remove-header', label: 'Remove header canvas', icon: <LayoutDashboard size={16} />, run: run(() => actions.removeHeaderCanvas()) }] : []),
    ...(context.canDashboard ? [{ id: 'dashboard', label: 'Turn into dashboard', icon: <LayoutDashboard size={16} />, run: run(() => actions.turnIntoDashboard()) }] : []),
    { id: 'translate', label: 'Translate', icon: <Languages size={16} />, keepOpen: true, run: run(() => actions.translate(actions.translateLocale), true) },
    { id: 'import', label: 'Import', icon: <Import size={16} />, run: run(() => context.onImport()) },
    { id: 'export', label: 'Export', icon: <Download size={16} />, run: run(() => actions.exportPage()) },
    { id: 'analytics', label: 'Updates & analytics', icon: <Clock size={16} />, keepOpen: true, run: run(() => actions.openAnalytics(), true) },
    { id: 'notify', label: 'Notify me', icon: <Bell size={16} />, hint: 'Comments', checked: actions.config.notifications.comments, keepOpen: true, run: run(() => actions.toggleNotifications(), true) },
    { id: 'connections', label: 'Connections', icon: <Plug size={16} />, hint: actions.config.connections.length ? 'MongoDB' : 'None', checked: actions.config.connections.length > 0, keepOpen: true, run: run(() => actions.manageConnections(), true) },
    ...PAGE_DEBUG_TOOLS.map((tool) => ({
      id: `debug-${tool.id}`,
      label: tool.label,
      icon: DEBUG_TOOL_ICONS[tool.id],
      testId: `debug-tool-${tool.id}`,
      keepOpen: true,
      checked: !!context.debugTools[tool.id],
      run: run(() => usePageDebugStore.getState().toggle(tool.id), true),
    })),
  ];

  return [
    { id: 'page', items: page },
    {
      id: 'appearance',
      items: [{ id: 'appearance-row', label: 'Appearance & layout', icon: <Palette size={16} />, keepOpen: true, run: () => context.onOpenAppearance() }],
      submenu: { label: 'Appearance & layout', icon: <Palette size={16} />, testId: 'page-menu-appearance', items: [...fonts, ...appearance] },
    },
    { id: 'ai', items: [
      { id: 'use-with-ai', label: 'Use with AI', icon: <Sparkles size={16} />, run: run(() => context.onUseAI()) },
      { id: 'lock', label: 'Lock page', icon: <Lock size={16} />, checked: actions.config.locked, keepOpen: true, run: run(() => actions.toggleLock(), true) },
    ] },
    { id: 'trash', items: [{ id: 'trash', label: 'Move to Trash', icon: <Trash2 size={16} />, danger: true, run: run(() => actions.moveToTrash()) }] },
    { id: 'more', label: 'More', items: more },
  ];
}

export const DEBUG_TOOL_HEADER = <><Bug size={11} className="shrink-0" />Tools</>;

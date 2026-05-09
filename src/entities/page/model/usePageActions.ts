import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useUserStore } from '@/features/auth';
import {
  pageConfigKey,
  resolvePageConfig,
  usePageConfigStore,
  type PageConfig,
  type PageFont,
  type PageVersion,
} from '@/shared/config/pageConfigStore';
import { useToastStore } from '@/shared/ui';
import { usePageStore } from '@/store/usePageStore';
import {
  copyPageContents,
  copyPageLink,
  exportPage as exportPageFile,
  importPageFile,
  syncPageActionEvent,
  translatePage,
  type PageActionName,
} from '@/services/page-actions';

const MINUTE_IN_MS = 60_000;
const HOUR_IN_MS = 3_600_000;
const DAY_IN_MS = 86_400_000;
const VERSION_AUTOSAVE_DELAY_MS = 1800;

export const TRANSLATION_LANGUAGES = [
  { locale: 'fr', label: 'French' },
  { locale: 'es', label: 'Spanish' },
  { locale: 'en', label: 'English' },
  { locale: 'de', label: 'German' },
  { locale: 'it', label: 'Italian' },
  { locale: 'pt', label: 'Portuguese' },
  { locale: 'nl', label: 'Dutch' },
  { locale: 'ar', label: 'Arabic' },
  { locale: 'ja', label: 'Japanese' },
  { locale: 'ko', label: 'Korean' },
  { locale: 'zh', label: 'Chinese' },
] as const;

export function translationLabel(locale: string): string {
  return TRANSLATION_LANGUAGES.find((language) => language.locale === locale)?.label ?? locale.toUpperCase();
}

export function fontSampleClass(font: PageFont): string {
  if (font === 'serif') return 'font-serif';
  if (font === 'mono') return 'font-mono';
  return '';
}

function formatEditedLabel(updatedAt: string | undefined, now: number): string {
  if (!updatedAt) return 'Edited recently';
  const elapsed = Math.max(0, now - new Date(updatedAt).getTime());
  if (Number.isNaN(elapsed)) return 'Edited recently';
  if (elapsed < MINUTE_IN_MS) return 'Edited just now';
  if (elapsed < HOUR_IN_MS) {
    const minutes = Math.floor(elapsed / MINUTE_IN_MS);
    return `Edited ${minutes} min ago`;
  }
  if (elapsed < DAY_IN_MS) {
    const hours = Math.floor(elapsed / HOUR_IN_MS);
    return `Edited ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(elapsed / DAY_IN_MS);
  return `Edited ${days} day${days === 1 ? '' : 's'} ago`;
}

function pageVersionSignature(page: { title: string; content?: unknown[] } | null | undefined): string {
  if (!page) return '';
  return JSON.stringify({ title: page.title, content: page.content ?? [] });
}

function textWordCount(value: string | undefined): number {
  return String(value ?? '').split(/\s+/).filter(Boolean).length;
}

function wordCountFromPage(page: { content?: Array<{ content?: string; children?: Array<{ content?: string }> }> } | null | undefined): number {
  return (page?.content ?? []).reduce((count, block) => count + textWordCount(block.content) + (block.children ?? []).reduce((total, child) => total + textWordCount(child.content), 0), 0);
}

export function usePageActions(pageId: string | null, workspaceId?: string) {
  const page = usePageStore((state) => (pageId ? state.pageById(pageId) : undefined));
  const activeUserId = useUserStore((state) => state.activeUserId);
  const jwt = useUserStore((state) => state.activeJwt());
  const activeWorkspace = useUserStore((state) => state.activeWorkspace());
  const safeUserId = activeUserId || 'anonymous';
  const resolvedWorkspaceId = workspaceId ?? page?.workspaceId ?? activeWorkspace?._id ?? '';
  const storedConfig = usePageConfigStore((state) => pageId ? state.configs[pageConfigKey(safeUserId, pageId)] : undefined);
  const config = useMemo(() => resolvePageConfig(storedConfig), [storedConfig]);
  const updateConfig = usePageConfigStore((state) => state.updateConfig);
  const recordAction = usePageConfigStore((state) => state.recordAction);
  const addVersion = usePageConfigStore((state) => state.addVersion);
  const duplicatePage = usePageStore((state) => state.duplicatePage);
  const archivePage = usePageStore((state) => state.archivePage);
  const updatePageTitle = usePageStore((state) => state.updatePageTitle);
  const updatePageContent = usePageStore((state) => state.updatePageContent);
  const pushToast = useToastStore((state) => state.push);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [detailPanel, setDetailPanel] = useState<'analytics' | 'versions' | null>(null);
  const [translateLocale, setTranslateLocale] = useState(config.activeTranslation?.locale ?? 'fr');
  const lastVersionSignatureRef = useRef<string | null>(null);
  const versionTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const versionCounterRef = useRef(0);

  useEffect(() => {
    const id = globalThis.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => globalThis.clearInterval(id);
  }, []);

  const currentVersionSignature = useMemo(() => pageVersionSignature(page), [page]);

  useEffect(() => {
    if (!page || !pageId) return undefined;
    if (lastVersionSignatureRef.current === null) {
      lastVersionSignatureRef.current = currentVersionSignature;
      return undefined;
    }
    if (lastVersionSignatureRef.current === currentVersionSignature) return undefined;
    if (versionTimerRef.current) globalThis.clearTimeout(versionTimerRef.current);
    versionTimerRef.current = globalThis.setTimeout(() => {
      const latestPage = usePageStore.getState().pageById(pageId);
      if (!latestPage) return;
      const latestSignature = pageVersionSignature(latestPage);
      if (lastVersionSignatureRef.current === latestSignature) return;
      versionCounterRef.current += 1;
      addVersion(safeUserId, pageId, {
        title: latestPage.title || 'Untitled',
        content: latestPage.content ?? [],
        label: `Autosave ${versionCounterRef.current}`,
      }).catch(() => undefined);
      lastVersionSignatureRef.current = latestSignature;
    }, VERSION_AUTOSAVE_DELAY_MS);
    return () => {
      if (versionTimerRef.current) {
        globalThis.clearTimeout(versionTimerRef.current);
        versionTimerRef.current = null;
      }
    };
  }, [addVersion, currentVersionSignature, page, pageId, safeUserId]);

  const editedLabel = useMemo(() => formatEditedLabel(page?.updatedAt, clockNow), [clockNow, page?.updatedAt]);
  const wordCount = useMemo(() => wordCountFromPage(page), [page]);

  const openHome = useCallback(() => {
    usePageStore.setState({ activePage: null, showTrash: false, navigationPath: [] });
  }, []);

  const logAction = useCallback(async (action: PageActionName, message: string, metadata: Record<string, unknown> = {}) => {
    if (!pageId) return;
    await recordAction(safeUserId, pageId, action, metadata);
    await syncPageActionEvent(pageId, action, jwt ?? undefined, metadata);
    setActionMessage(message);
    pushToast({ kind: 'success', title: message });
  }, [jwt, pageId, pushToast, recordAction, safeUserId]);

  const snapshot = useCallback(async (label: string) => {
    if (!page || !pageId) return;
    await addVersion(safeUserId, pageId, { title: page.title || 'Untitled', content: page.content ?? [], label });
  }, [addVersion, page, pageId, safeUserId]);

  const updatePageSetting = useCallback(async (updates: Partial<PageConfig>, action: PageActionName, message: string) => {
    if (!pageId) return;
    await updateConfig(safeUserId, pageId, updates);
    await logAction(action, message, updates as Record<string, unknown>);
  }, [logAction, pageId, safeUserId, updateConfig]);

  const setFont = useCallback((font: PageFont) => updatePageSetting({ font }, 'small_text', `${font} font applied`), [updatePageSetting]);
  const present = useCallback(() => updatePageSetting({ presentationMode: !config.presentationMode }, 'present', config.presentationMode ? 'Presentation disabled' : 'Presentation enabled'), [config.presentationMode, updatePageSetting]);
  const toggleSmallText = useCallback(() => updatePageSetting({ smallText: !config.smallText }, 'small_text', 'Small text toggled'), [config.smallText, updatePageSetting]);
  const toggleFullWidth = useCallback(() => updatePageSetting({ fullWidth: !config.fullWidth }, 'full_width', 'Full width toggled'), [config.fullWidth, updatePageSetting]);
  const toggleLock = useCallback(() => updatePageSetting({ locked: !config.locked }, 'lock_page', config.locked ? 'Page unlocked' : 'Page locked'), [config.locked, updatePageSetting]);
  const toggleNotifications = useCallback(() => updatePageSetting({ notifications: { comments: !config.notifications.comments } }, 'notify_me', config.notifications.comments ? 'Notifications disabled' : 'Notifications enabled'), [config.notifications.comments, updatePageSetting]);

  const copyLink = useCallback(async () => {
    if (!pageId) return;
    await copyPageLink(pageId);
    await logAction('copy_link', 'Link copied');
  }, [logAction, pageId]);

  const copyContents = useCallback(async () => {
    if (!page) return;
    await copyPageContents(page);
    await logAction('copy_page_contents', 'Page contents copied');
  }, [logAction, page]);

  const duplicate = useCallback(async () => {
    if (!page || !pageId || !resolvedWorkspaceId) return;
    await snapshot('Before duplicate');
    const newId = await duplicatePage(pageId, resolvedWorkspaceId);
    await logAction('duplicate', newId ? 'Page duplicated' : 'Duplicate blocked', { newId });
  }, [duplicatePage, logAction, page, pageId, resolvedWorkspaceId, snapshot]);

  const moveToTrash = useCallback(async () => {
    if (!page || !pageId || !resolvedWorkspaceId) return;
    await snapshot('Before move to trash');
    await archivePage(pageId, resolvedWorkspaceId, jwt ?? '');
    await logAction('move_to_trash', 'Page moved to trash');
    openHome();
  }, [archivePage, jwt, logAction, openHome, page, pageId, resolvedWorkspaceId, snapshot]);

  const translate = useCallback(async (targetLocale = translateLocale) => {
    if (!page || !pageId) return;
    const label = translationLabel(targetLocale);
    await snapshot(`Before translation to ${label}`);
    const translated = await translatePage(page, jwt ?? undefined, targetLocale);
    if (translated.title) updatePageTitle(pageId, translated.title);
    if (translated.content) updatePageContent(pageId, translated.content);
    const translationRecord = {
      id: crypto.randomUUID(),
      userId: safeUserId,
      pageId,
      locale: targetLocale,
      label,
      title: translated.title ?? page.title,
      content: translated.content ?? page.content ?? [],
      createdAt: new Date().toISOString(),
    };
    const latestConfig = usePageConfigStore.getState().getConfig(safeUserId, pageId);
    await updateConfig(safeUserId, pageId, {
      translations: [translationRecord, ...latestConfig.translations.filter((item) => item.locale !== targetLocale)].slice(0, 20),
      activeTranslation: { id: translationRecord.id, locale: targetLocale, label },
    });
    await logAction('translate', `Page translated to ${label}`, { targetLocale });
  }, [jwt, logAction, page, pageId, safeUserId, snapshot, translateLocale, updateConfig, updatePageContent, updatePageTitle]);

  const importFile = useCallback(async (file: File) => {
    if (!page || !pageId) return;
    await snapshot('Before import');
    const imported = await importPageFile(file);
    if (imported.title) updatePageTitle(pageId, imported.title);
    updatePageContent(pageId, imported.content);
    await logAction('import', 'Page imported', { fileName: file.name });
  }, [logAction, page, pageId, snapshot, updatePageContent, updatePageTitle]);

  const exportPage = useCallback(async () => {
    if (!page) return;
    exportPageFile(page, config);
    await logAction('export', 'Page exported', { title: page.title });
  }, [config, logAction, page]);

  const manageConnections = useCallback(async () => {
    if (!pageId) return;
    const existing = config.connections.find((connection) => connection.id === 'mongodb-page-settings');
    const connections = existing
      ? config.connections.filter((connection) => connection.id !== existing.id)
      : [...config.connections, { id: 'mongodb-page-settings', name: 'MongoDB page settings', status: 'connected' as const, updatedAt: new Date().toISOString() }];
    await updateConfig(safeUserId, pageId, { connections });
    await logAction('connections', existing ? 'Connection disabled' : 'MongoDB connection enabled');
  }, [config.connections, logAction, pageId, safeUserId, updateConfig]);

  const openAnalytics = useCallback(() => {
    setDetailPanel((panel) => panel === 'analytics' ? null : 'analytics');
    void logAction('updates_analytics', 'Analytics opened');
  }, [logAction]);

  const openVersionHistory = useCallback(() => {
    setDetailPanel((panel) => panel === 'versions' ? null : 'versions');
    void logAction('version_history', 'Version history opened');
  }, [logAction]);

  const restoreVersion = useCallback(async (version: PageVersion) => {
    if (!pageId) return;
    await snapshot('Before version restore');
    updatePageTitle(pageId, version.title);
    updatePageContent(pageId, version.content);
    lastVersionSignatureRef.current = pageVersionSignature({ title: version.title, content: version.content });
    await logAction('version_history', 'Version restored', { versionId: version.id });
  }, [logAction, pageId, snapshot, updatePageContent, updatePageTitle]);

  return {
    actionMessage,
    config,
    detailPanel,
    editedLabel,
    page,
    setFont,
    translateLocale,
    setTranslateLocale,
    versions: config.versions,
    wordCount,
    copyLink,
    copyContents,
    duplicate,
    moveToTrash,
    present,
    toggleSmallText,
    toggleFullWidth,
    toggleLock,
    toggleNotifications,
    translate,
    importFile,
    exportPage,
    openVersionHistory,
    openAnalytics,
    manageConnections,
    restoreVersion,
  };
}
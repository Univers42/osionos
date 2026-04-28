import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Check,
  Clipboard,
  Clock,
  Copy,
  Download,
  History,
  Import,
  Languages,
  Link,
  Lock,
  Maximize2,
  MoreHorizontal,
  Plug,
  Presentation,
  Search,
  Text,
  Trash2,
} from "lucide-react";

import { PageOptionsMenu } from "@/features/page-management";
import { useUserStore } from "@/features/auth";
import {
  pageConfigKey,
  resolvePageConfig,
  usePageConfigStore,
  type PageConfig,
  type PageFont,
  type PageVersion,
} from "@/shared/config/pageConfigStore";
import { usePageStore } from "@/store/usePageStore";
import {
  copyPageContents,
  copyPageLink,
  exportPage,
  importPageFile,
  syncPageActionEvent,
  translatePage,
  type PageActionName,
} from "@/services/page-actions";

import { PageBreadcrumbs } from "./PageBreadcrumbs";

const MINUTE_IN_MS = 60_000;
const HOUR_IN_MS = 3_600_000;
const DAY_IN_MS = 86_400_000;

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
  { id: "default", label: "Default", sample: "Ag" },
  { id: "serif", label: "Serif", sample: "Ag" },
  { id: "mono", label: "Mono", sample: "Ag" },
];

function fontSampleClass(font: PageFont): string {
  if (font === "serif") return "font-serif";
  if (font === "mono") return "font-mono";
  return "";
}

function formatEditedLabel(updatedAt: string | undefined): string {
  if (!updatedAt) return "Edited recently";

  const elapsed = Math.max(0, Date.now() - new Date(updatedAt).getTime());

  if (Number.isNaN(elapsed)) return "Edited recently";
  if (elapsed < MINUTE_IN_MS) return "Edited just now";

  if (elapsed < HOUR_IN_MS) {
    const min = Math.floor(elapsed / MINUTE_IN_MS);
    return `Edited ${min} min ago`;
  }

  if (elapsed < DAY_IN_MS) {
    const hrs = Math.floor(elapsed / HOUR_IN_MS);
    return `Edited ${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(elapsed / DAY_IN_MS);
  return `Edited ${days} day${days === 1 ? "" : "s"} ago`;
}

const MenuButton: React.FC<MenuButtonProps> = ({
  icon,
  label,
  onClick,
  checked,
  destructive,
  shortcut,
  trailing,
  badge,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex min-h-8 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-hover)] ${destructive ? "text-[var(--color-text-danger)]" : ""}`}
  >
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--color-ink-muted)]">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {badge && <span className="rounded bg-[var(--color-surface-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-muted)]">{badge}</span>}
    {shortcut && <span className="text-xs text-[var(--color-ink-faint)]">{shortcut}</span>}
    {trailing && <span className="max-w-20 truncate text-xs text-[var(--color-ink-faint)]">{trailing}</span>}
    {checked && <Check size={14} className="shrink-0 text-[var(--color-accent)]" />}
  </button>
);

const AnalyticsPanel: React.FC<{ config: PageConfig }> = ({ config }) => (
  <div className="border-t border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-muted)]">
    <p className="mb-1 font-medium text-[var(--color-ink)]">Updates & analytics</p>
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

const VersionsPanel: React.FC<{
  versions: PageVersion[];
  onRestore: (version: PageVersion) => void;
}> = ({ versions, onRestore }) => (
  <div className="border-t border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-muted)]">
    <p className="mb-1 font-medium text-[var(--color-ink)]">Version history</p>
    {versions.length === 0 ? (
      <p>No version saved yet.</p>
    ) : (
      <div className="space-y-1">
        {versions.slice(0, 5).map((version) => (
          <button
            key={version.id}
            type="button"
            onClick={() => onRestore(version)}
            className="w-full rounded px-2 py-1 text-left hover:bg-[var(--color-surface-hover)]"
          >
            <span className="block text-[var(--color-ink)]">{version.label}</span>
            <span>{new Date(version.createdAt).toLocaleString()}</span>
          </button>
        ))}
      </div>
    )}
  </div>
);

export const PageHeaderBar: React.FC<PageHeaderBarProps> = ({
  pageId,
  workspaceId,
}) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const activeUserId = useUserStore((s) => s.activeUserId);
  const jwt = useUserStore((s) => s.activeJwt());
  const safeUserId = activeUserId || "anonymous";
  const storedConfig = usePageConfigStore((s) => s.configs[pageConfigKey(safeUserId, pageId)]);
  const config = useMemo(() => resolvePageConfig(storedConfig), [storedConfig]);
  const updateConfig = usePageConfigStore((s) => s.updateConfig);
  const recordAction = usePageConfigStore((s) => s.recordAction);
  const addVersion = usePageConfigStore((s) => s.addVersion);
  const duplicatePage = usePageStore((s) => s.duplicatePage);
  const archivePage = usePageStore((s) => s.archivePage);
  const updatePageTitle = usePageStore((s) => s.updatePageTitle);
  const updatePageContent = usePageStore((s) => s.updatePageContent);
  const [tick, setTick] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [detailPanel, setDetailPanel] = useState<"analytics" | "versions" | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleOpenHome = useCallback(() => {
    usePageStore.setState({
      activePage: null,
      showTrash: false,
      navigationPath: [],
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // `tick` is intentionally present in deps to refresh the label periodically.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const editedLabel = useMemo(() => formatEditedLabel(page?.updatedAt), [page?.updatedAt, tick]);

  async function logAction(action: PageActionName, message: string, metadata: Record<string, unknown> = {}) {
    await recordAction(safeUserId, pageId, action, metadata);
    await syncPageActionEvent(pageId, action, jwt ?? undefined, metadata);
    setActionMessage(message);
  }

  async function snapshot(label: string) {
    if (!page) return;
    await addVersion(safeUserId, pageId, {
      title: page.title || "Untitled",
      content: page.content ?? [],
      label,
    });
  }

  async function updatePageSetting(updates: Parameters<typeof updateConfig>[2], action: PageActionName, message: string) {
    await updateConfig(safeUserId, pageId, updates);
    await logAction(action, message, updates as Record<string, unknown>);
  }

  async function handleDuplicate() {
    if (!page) return;
    await snapshot("Before duplicate");
    const newId = await duplicatePage(pageId, workspaceId);
    await logAction("duplicate", newId ? "Page duplicated" : "Duplicate blocked", { newId });
  }

  async function handleMoveToTrash() {
    if (!page) return;
    await snapshot("Before move to trash");
    await archivePage(pageId, workspaceId, jwt ?? "");
    await logAction("move_to_trash", "Page moved to trash");
    handleOpenHome();
  }

  async function handleTranslate() {
    if (!page) return;
    await snapshot("Before translation");
    const translated = await translatePage(page, jwt ?? undefined, "fr");
    if (translated.title) updatePageTitle(pageId, translated.title);
    if (translated.content) updatePageContent(pageId, translated.content);
    await logAction("translate", "Page translated to French", { targetLocale: "fr" });
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !page) return;
    await snapshot("Before import");
    const imported = await importPageFile(file);
    if (imported.title) updatePageTitle(pageId, imported.title);
    updatePageContent(pageId, imported.content);
    await logAction("import", "Page imported", { fileName: file.name });
  }

  async function handleExport() {
    if (!page) return;
    exportPage(page, config);
    await logAction("export", "Page exported", { title: page.title });
  }

  async function handleConnections() {
    const existing = config.connections.find((connection) => connection.id === "mongodb-page-settings");
    const connections = existing
      ? config.connections.filter((connection) => connection.id !== existing.id)
      : [
          ...config.connections,
          {
            id: "mongodb-page-settings",
            name: "MongoDB page settings",
            status: "connected" as const,
            updatedAt: new Date().toISOString(),
          },
        ];

    await updateConfig(safeUserId, pageId, { connections });
    await logAction("connections", existing ? "Connection disabled" : "MongoDB connection enabled");
  }

  function restoreVersion(version: PageVersion) {
    updatePageTitle(pageId, version.title);
    updatePageContent(pageId, version.content as Parameters<typeof updatePageContent>[1]);
    void logAction("version_history", "Version restored", { versionId: version.id });
  }

  return (
    <div className="sticky top-0 z-10 flex h-11 w-full items-center border-b border-[var(--color-line)] bg-[var(--color-surface-primary)]">
      <div className="flex w-full items-center justify-between px-4">
        <div className="min-w-0 flex-1 overflow-hidden">
          <PageBreadcrumbs pageId={pageId} onOpenHome={handleOpenHome} />
        </div>

        <div className="flex shrink-0 items-center gap-3 pl-4">
          <span className="hidden whitespace-nowrap text-[13px] text-[var(--color-ink-faint)] sm:inline">
            {editedLabel}
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setConfigOpen((open) => !open)}
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]"
              aria-label="Open page configuration"
            >
              <MoreHorizontal size={18} />
            </button>
            {configOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 w-72 max-h-[80vh] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] py-2 shadow-xl">
                <div className="px-3 pb-2">
                  <div className="flex h-8 items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-2">
                    <Search size={14} className="text-[var(--color-ink-muted)]" />
                    <input placeholder="Search actions…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1 px-3 pb-2">
                  {FONT_OPTIONS.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => updatePageSetting({ font: font.id }, "small_text", `${font.label} font applied`)}
                      className={`rounded-md px-2 py-2 text-center hover:bg-[var(--color-surface-hover)] ${config.font === font.id ? "text-[var(--color-accent)]" : ""}`}
                    >
                      <span className={`block text-xl ${fontSampleClass(font.id)}`}>{font.sample}</span>
                      <span className="text-xs">{font.label}</span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-[var(--color-line)] py-1">
                  <MenuButton icon={<Link size={16} />} label="Copy link" onClick={() => page && copyPageLink(pageId).then(() => logAction("copy_link", "Link copied"))} />
                  <MenuButton icon={<Clipboard size={16} />} label="Copy page contents" onClick={() => page && copyPageContents(page).then(() => logAction("copy_page_contents", "Page contents copied"))} />
                  <MenuButton icon={<Copy size={16} />} label="Duplicate" shortcut="Ctrl+D" onClick={handleDuplicate} />
                  <MenuButton icon={<Trash2 size={16} />} label="Move to Trash" destructive onClick={handleMoveToTrash} />
                </div>

                <div className="border-t border-[var(--color-line)] py-1">
                  <MenuButton icon={<Presentation size={16} />} label="Present" shortcut="Ctrl+Alt+P" checked={config.presentationMode} badge="Beta" onClick={() => updatePageSetting({ presentationMode: !config.presentationMode }, "present", config.presentationMode ? "Presentation disabled" : "Presentation enabled")} />
                  <MenuButton icon={<Text size={16} />} label="Small text" checked={config.smallText} onClick={() => updatePageSetting({ smallText: !config.smallText }, "small_text", "Small text toggled")} />
                  <MenuButton icon={<Maximize2 size={16} />} label="Full width" checked={config.fullWidth} onClick={() => updatePageSetting({ fullWidth: !config.fullWidth }, "full_width", "Full width toggled")} />
                  <MenuButton icon={<Lock size={16} />} label="Lock page" checked={config.locked} onClick={() => updatePageSetting({ locked: !config.locked }, "lock_page", config.locked ? "Page unlocked" : "Page locked")} />
                  <MenuButton icon={<Languages size={16} />} label="Translate" trailing="French" onClick={handleTranslate} />
                </div>

                <div className="border-t border-[var(--color-line)] py-1">
                  <input ref={importInputRef} type="file" accept=".json,.md,.markdown,.txt" className="hidden" onChange={handleImportFile} />
                  <MenuButton icon={<Import size={16} />} label="Import" onClick={() => importInputRef.current?.click()} />
                  <MenuButton icon={<Download size={16} />} label="Export" onClick={handleExport} />
                </div>

                <div className="border-t border-[var(--color-line)] py-1">
                  <MenuButton icon={<Clock size={16} />} label="Updates & analytics" onClick={() => { setDetailPanel(detailPanel === "analytics" ? null : "analytics"); void logAction("updates_analytics", "Analytics opened"); }} />
                  <MenuButton icon={<History size={16} />} label="Version history" onClick={() => { setDetailPanel(detailPanel === "versions" ? null : "versions"); void logAction("version_history", "Version history opened"); }} />
                  <MenuButton icon={<Bell size={16} />} label="Notify me" checked={config.notifications.comments} trailing="Comments" onClick={() => updatePageSetting({ notifications: { comments: !config.notifications.comments } }, "notify_me", config.notifications.comments ? "Notifications disabled" : "Notifications enabled")} />
                  <MenuButton icon={<Plug size={16} />} label="Connections" trailing={config.connections.length ? "MongoDB" : "None"} checked={config.connections.length > 0} onClick={handleConnections} />
                </div>

                {detailPanel === "analytics" && <AnalyticsPanel config={config} />}
                {detailPanel === "versions" && <VersionsPanel versions={config.versions} onRestore={restoreVersion} />}

                <div className="border-t border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-faint)]">
                  <p>Word count: {(page?.content ?? []).reduce((count, block) => count + String(block.content ?? "").split(/\s+/).filter(Boolean).length, 0)} words</p>
                  <p>Last action: {actionMessage ?? config.lastAction?.action ?? "None"}</p>
                </div>
              </div>
            )}
          </div>
          <PageOptionsMenu
            pageId={pageId}
            workspaceId={workspaceId}
            pageTitle={page?.title || "Untitled"}
            isActivePage
            onRedirectHome={handleOpenHome}
          />
        </div>
      </div>
    </div>
  );
};

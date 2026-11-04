/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ImportPanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { Database, FileText, Inbox, Upload } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { usePageStore } from '@/store/usePageStore';
import { useImportHistoryStore, type ImportHistoryEntry } from '@/store/settings';
import { useAssetLibraryStore } from '@/shared/config/assetLibraryStore';
import { importPageFile } from '@/services/page-actions';
import { Button, Modal, useToastStore } from '@/shared/ui';
import { DataTable, EmptyState, FeatureCard, MiniTabs, PanelStatus, Section } from '../ui/settingsKit';
import { assetKindFromFile, formatBytes, readFileAsDataUrl, stringPayload } from '../model/settingsFiles';
import { runAsync } from '../model/settingsCalls';
import { useSettingsHydration } from '../model/settingsHydration';
import { readZipEntries } from './zipEntries';
import { linkImportedPages } from './relativeLinks';

const EMPTY_IMPORT_HISTORY: ImportHistoryEntry[] = [];

type SettingsModalName = 'typed-import';

const PAGE_EXTENSIONS = new Set(['.md', '.markdown', '.html', '.json', '.txt']);

function extensionOf(name: string): string {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

export const ImportPanel: React.FC<{ workspaceId?: string; activeUserId: string }> = ({ workspaceId = 'local-workspace', activeUserId }) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [activeImportTab, setActiveImportTab] = useState('Discover');
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);
  const addAsset = useAssetLibraryStore((s) => s.addAsset);
  const addPage = usePageStore((state) => state.addPage);
  const openPage = usePageStore((state) => state.openPage);
  const updatePageContent = usePageStore((state) => state.updatePageContent);
  const jwt = useUserStore((state) => state.activePageJwt());
  const history = useImportHistoryStore((state) => state.data[workspaceId] ?? EMPTY_IMPORT_HISTORY);
  const hydrateHistory = useImportHistoryStore((state) => state.hydrate);
  const addImportEntry = useImportHistoryStore((state) => state.addEntry);
  const markRetry = useImportHistoryStore((state) => state.markRetry);
  // Only what imports today: a page per text file, a page tree per zip, media to the asset library.
  // CSV, PDF and Word had cards and were sent to /api/imports, which no server mounts (#239).
  const files = ['ZIP', 'Text & Markdown', 'HTML'];
  const plannedFiles = ['CSV', 'PDF', 'Word'];
  const apps = ['Asana', 'Confluence', 'Trello', 'Workflowy', 'Evernote', 'Jira', 'Monday.com', 'Quip', 'Google Docs'];

  // The store keeps a failed read in `error` instead of rejecting, so it is turned back into a rejection here.
  const hydration = useSettingsHydration(async () => {
    await hydrateHistory(workspaceId);
    const failure = useImportHistoryStore.getState().error[workspaceId];
    if (failure) throw new Error(failure);
  }, [hydrateHistory, workspaceId]);

  /** The folder page for `path`, created with its parents on first use. */
  async function folderFor(path: string[], folders: Map<string, string>): Promise<string | undefined> {
    let parent: string | undefined;
    for (let depth = 1; depth <= path.length; depth += 1) {
      const key = path.slice(0, depth).join('/');
      if (!folders.has(key)) {
        const folder = await addPage(workspaceId, path[depth - 1], jwt ?? '', parent, { surface: 'folder' });
        if (folder?._id) folders.set(key, folder._id);
      }
      parent = folders.get(key) ?? parent;
    }
    return parent;
  }

  /** Second pass: a Markdown page that links to pages of the same archive gets those links as page mentions. */
  async function linkArchivePages(sources: { pageId: string; name: string; dir: string[]; text: string }[], pageIdByPath: Map<string, string>) {
    for (const { pageId, name, dir, text } of sources) {
      const linked = linkImportedPages(text, dir, pageIdByPath);
      if (linked !== text) updatePageContent(pageId, (await importPageFile(new File([linked], name))).content);
    }
  }

  async function importZip(file: File) {
    const startedAt = new Date().toISOString();
    const folders = new Map<string, string>();
    const pageIds: string[] = [];
    const pageIdByPath = new Map<string, string>();
    const markdownSources: { pageId: string; name: string; dir: string[]; text: string }[] = [];
    for (const { segments, bytes } of await readZipEntries(file)) {
      const name = segments[segments.length - 1];
      const extension = extensionOf(name);
      if (!PAGE_EXTENSIONS.has(extension)) continue;
      const dir = segments.slice(0, -1);
      const parent = await folderFor(dir, folders);
      const payload = await importPageFile(new File([bytes.slice()], name));
      const page = await addPage(workspaceId, payload.title || name, jwt ?? '', parent, { content: payload.content });
      if (!page?._id) continue;
      pageIds.push(page._id);
      pageIdByPath.set(segments.join('/'), page._id);
      if (extension === '.md' || extension === '.markdown') markdownSources.push({ pageId: page._id, name, dir, text: new TextDecoder().decode(bytes) });
    }
    await linkArchivePages(markdownSources, pageIdByPath);
    const error = pageIds.length ? null : 'No Markdown, HTML, JSON or text files in this archive.';
    addImportEntry(workspaceId, { userId: activeUserId || 'anonymous', workspaceId, source: 'file', fileName: file.name, byteSize: file.size, status: error ? 'failed' : 'completed', pageIds, error, startedAt, finishedAt: new Date().toISOString() });
  }

  async function importFiles(imports: File[]) {
    for (const file of imports) {
      const extension = extensionOf(file.name);
      if (extension === '.zip') {
        await importZip(file);
        continue;
      }
      if (PAGE_EXTENSIONS.has(extension)) {
        const payload = await importPageFile(file);
        const page = await addPage(workspaceId, payload.title || file.name, jwt ?? '', undefined, { content: payload.content });
        // A refused create already toasted its reason (notifyCreateFailure); it is not a completed import.
        const pageId = page?._id;
        addImportEntry(workspaceId, { userId: activeUserId || 'anonymous', workspaceId, source: 'file', fileName: file.name, byteSize: file.size, status: pageId ? 'completed' : 'failed', pageIds: pageId ? [pageId] : [], error: pageId ? null : 'The page could not be created.', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), removedAt: null });
        continue;
      }
      const kind = assetKindFromFile(file);
      const at = new Date().toISOString();
      const entry = { userId: activeUserId || 'anonymous', workspaceId, source: 'file' as const, fileName: file.name, byteSize: file.size, pageIds: [], startedAt: at, finishedAt: at, removedAt: null };
      if (kind === 'file') {
        const error = `osionos cannot import ${extension || 'these'} files yet.`;
        addImportEntry(workspaceId, { ...entry, status: 'failed', error });
        useToastStore.getState().push({ kind: 'error', title: `${file.name} was not imported`, description: `${error} ZIP, Markdown, HTML, JSON and text files become pages; images, audio and video go to your asset library.` });
        continue;
      }
      addAsset(activeUserId, { kind, name: file.name, source: await readFileAsDataUrl(file), origin: 'upload', mimeType: file.type, size: file.size });
      addImportEntry(workspaceId, { ...entry, status: 'completed', error: null });
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
      <PanelStatus status={hydration.status} error={hydration.error} onRetry={hydration.retry}>
        <MiniTabs active={activeImportTab} onChange={setActiveImportTab} tabs={[{ label: 'Discover' }, { label: 'Completed', count: completedRows.length }]} />
        <Section title="Completed imports">
          <DataTable headers={['Import', 'Size', 'Finished', '']} rows={completedRows} empty={<EmptyState icon={<Inbox size={16} />} title="No completed imports yet" hint="Files you import show up here." />} />
        </Section>
      </PanelStatus>
    );
  }

  return (
    <PanelStatus status={hydration.status} error={hydration.error} onRetry={hydration.retry}>
      <MiniTabs active={activeImportTab} onChange={setActiveImportTab} tabs={[{ label: 'Discover' }, { label: 'Completed', count: completedRows.length }]} />
      <Section title="Import your content">
        <button type="button" className="w-full rounded-[var(--osio-radius-panel)] border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-8 text-center" onClick={() => fileInputRef.current?.click()} onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
          <Upload className="mx-auto text-[var(--osio-accent)]" size={28} />
          <h4 className="mt-3 font-medium text-[var(--osio-fg-default)]">Import your content to osionos</h4>
          <p className="mt-2 text-sm text-[var(--osio-fg-muted)]">ZIP, Markdown, HTML, JSON and text files become pages; images, audio and video go to your asset library.</p>
          <p className="mt-1 text-xs text-[var(--osio-fg-subtle)]">A zip holds up to 2000 files of 32 MB each.</p>
          <input name="import-file" ref={fileInputRef} type="file" multiple className="hidden" onChange={handleLibraryImport} />
          <span className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-1.5 text-sm font-medium text-[var(--osio-fg-default)]"><Upload size={16} /> Choose files</span>
        </button>
      </Section>
      <Section title="File-based imports"><div className="grid gap-3 sm:grid-cols-2">{files.map((file) => <FeatureCard key={file} icon={<FileText size={16} />} title={file} description={`Import ${file.toLowerCase()} content from files`} action={<Button onClick={() => setModal({ name: 'typed-import', payload: { kind: file } })}>Open</Button>} />)}</div></Section>
      <Section title="Not available yet"><div className="grid gap-3 sm:grid-cols-2">{plannedFiles.map((file) => <FeatureCard key={file} icon={<FileText size={16} />} title={file} description="Not available yet" action={<Button disabled aria-label={`Import ${file} files`}>Open</Button>} />)}</div></Section>
      <Section title="Third-party imports"><div className="grid gap-3 sm:grid-cols-2">{apps.map((app) => <FeatureCard key={app} icon={<Database size={16} />} title={app} description="Not available yet" action={<Button disabled aria-label={`Import from ${app}`}>Import</Button>} />)}</div></Section>
      {modal?.name === 'typed-import' && <TypedImportModal kind={stringPayload(modal.payload?.kind, 'File')} onChoose={() => fileInputRef.current?.click()} onClose={() => setModal(null)} />}
    </PanelStatus>
  );
};

const TypedImportModal: React.FC<{ kind: string; onChoose: () => void; onClose: () => void }> = ({ kind, onChoose, onClose }) => (
  <Modal open onClose={onClose} title={`${kind} import`} size="sm">
    <div className="space-y-4 p-6">
      <p className="text-sm text-[var(--osio-fg-muted)]">Choose a local file and osionos will route it to pages or the asset library based on type.</p>
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => { onChoose(); onClose(); }}>Choose file</Button></div>
    </div>
  </Modal>
);

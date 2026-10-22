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

import React, { useEffect, useState } from 'react';
import { Database, FileText, Upload } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { usePageStore } from '@/store/usePageStore';
import { useImportHistoryStore, type ImportHistoryEntry } from '@/store/settings';
import { useAssetLibraryStore } from '@/shared/config/assetLibraryStore';
import { importPageFile } from '@/services/page-actions';
import { Button, Modal } from '@/shared/ui';
import { DataTable, FeatureCard, MiniTabs, Section } from '../ui/settingsKit';
import { assetKindFromFile, formatBytes, readFileAsDataUrl, stringPayload } from '../model/settingsFiles';
import { runAsync } from '../model/settingsCalls';

const EMPTY_IMPORT_HISTORY: ImportHistoryEntry[] = [];

type SettingsModalName = 'typed-import' | 'provider-import';

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
        <button type="button" className="w-full rounded-[var(--osio-radius-panel)] border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-8 text-center" onClick={() => fileInputRef.current?.click()} onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
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
        <div className="h-2 overflow-hidden rounded-xs bg-[var(--osio-bg-muted)]"><div className="h-full bg-[var(--osio-accent)] transition-all" style={{ width: `${progress}%` }} /></div>
        <p className="text-sm text-[var(--osio-fg-muted)]">{progress >= 100 ? 'Import completed.' : 'Importing workspace content...'}</p>
        <div className="flex justify-end"><Button tone="primary" onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
};

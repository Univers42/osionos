import React from 'react';

import type { PageConfig, PageVersion } from '@/shared/config/pageConfigStore';

export const AnalyticsPanel: React.FC<{ config: PageConfig }> = ({ config }) => (
  <div className="border-t border-[var(--osio-border-default)] px-2 py-2 text-xs text-[var(--osio-fg-muted)]">
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

export const VersionsPanel: React.FC<{ versions: PageVersion[]; onRestore: (version: PageVersion) => void; onSave: () => void }> = ({ versions, onRestore, onSave }) => (
  <div className="border-t border-[var(--osio-border-default)] px-2 py-2 text-xs text-[var(--osio-fg-muted)]">
    <div className="mb-1.5 flex items-center justify-between">
      <p className="font-medium text-[var(--osio-fg-default)]">Version history</p>
      <button type="button" onClick={onSave} className="rounded-[var(--osio-radius-sm)] border border-[var(--osio-border-default)] px-2 py-0.5 font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]">Save version</button>
    </div>
    {versions.length === 0 ? <p>No version saved yet — edits autosave, or click “Save version”.</p> : (
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {versions.map((version) => (
          <button key={version.id} type="button" title="Restore this version" onClick={() => onRestore(version)} className="w-full rounded-[var(--osio-radius-sm)] px-2 py-1 text-left hover:bg-[var(--osio-bg-hover)]">
            <span className="block text-[var(--osio-fg-default)]">{version.label}</span>
            <span>{new Date(version.createdAt).toLocaleString()}</span>
          </button>
        ))}
      </div>
    )}
  </div>
);

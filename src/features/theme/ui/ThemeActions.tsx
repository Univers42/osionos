import React, { useRef, useState } from 'react';

import { Button, Textarea, useToastStore } from '@/shared/ui';
import { downloadText } from '@/shared/lib/download/downloadText';
import type { ThemeDoc } from '@/shared/config/themeDoc';
import { isShippedThemeName } from '@/shared/config/themes';
import { themeSlug } from '../../../../scripts/bridge-theme-rules.mjs';
import { openThemeJson } from '@/features/theme-editor/model/openThemeJson';
import { MAX_IMPORT_CHARS } from '../model/appearanceTransfer';
import { uniqueThemeName } from '../model/themeNaming';
import { parseThemeImport } from '../model/themeImport';
import { useThemeLibrary } from '../model/useThemeLibrary';

interface ThemeActionsProps {
  active: ThemeDoc | null;
  mode: 'light' | 'dark' | 'system';
  themes: Record<string, ThemeDoc>;
}

const resolvedMode = (mode: ThemeActionsProps['mode']): 'light' | 'dark' =>
  mode === 'system' ? (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;

/**
 * What a person can do with the selected theme: customize or duplicate it, delete their own
 * (with Undo), start a new one, copy or download its JSON, and import one. Failures show in a
 * `role="alert"` line instead of failing silently.
 */
export const ThemeActions: React.FC<ThemeActionsProps> = ({ active, mode, themes }) => {
  const saveTheme = useThemeLibrary((state) => state.saveTheme);
  const deleteTheme = useThemeLibrary((state) => state.deleteTheme);
  const setActiveTheme = useThemeLibrary((state) => state.setActiveTheme);
  const push = useToastStore((state) => state.push);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const own = active !== null && !isShippedThemeName(active.name);
  const taken = () => Object.values(themes).map((doc) => doc.name);

  /** Saves a copy of the selection (a minimal doc for Built-in), activates it, and returns its name; null when saving was refused. */
  const makeCopy = (): string | null => {
    const name = uniqueThemeName(`${active?.name ?? 'Built-in'} copy`, taken());
    const result = saveTheme(active ? { ...active, name } : { name, base: resolvedMode(mode) });
    if (!result.ok) {
      setError(result.message);
      return null;
    }
    setError('');
    setActiveTheme(name);
    return name;
  };

  const customize = () => {
    if (own && active) {
      openThemeJson({ kind: 'theme', slug: themeSlug(active.name) });
      return;
    }
    const name = makeCopy();
    if (name) openThemeJson({ kind: 'theme', slug: themeSlug(name) });
  };

  const remove = () => {
    const doc = active && deleteTheme(active.name);
    if (!doc) return;
    setError('');
    push({
      kind: 'info',
      title: `Deleted ${doc.name}`,
      action: { label: 'Undo', onClick: () => { saveTheme(doc); setActiveTheme(doc.name); } },
    });
  };

  const json = () => JSON.stringify(active, null, 2);

  const copyJson = () => {
    const write = globalThis.navigator?.clipboard?.writeText(json());
    if (write) write.then(() => push({ kind: 'success', title: 'Theme copied' }), () => setError('Could not copy. Use Download instead.'));
    else setError('Copying is not available here. Use Download instead.');
  };

  const importText = (source: string) => {
    const parsed = parseThemeImport(source);
    if (!parsed.ok) return setError(parsed.message);
    const name = uniqueThemeName(parsed.doc.name, taken());
    const saved = saveTheme({ ...parsed.doc, name });
    if (!saved.ok) return setError(saved.message);
    setError('');
    setText('');
    setActiveTheme(name);
    push({ kind: 'success', title: `Imported ${name}` });
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_CHARS) return setError(`That file is too long: the limit is ${MAX_IMPORT_CHARS} characters.`);
    importText(await file.text());
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={customize}>Customize</Button>
        <Button size="sm" onClick={makeCopy} disabled={!active}>Duplicate</Button>
        <Button size="sm" onClick={remove} disabled={!own}>Delete</Button>
        <Button size="sm" onClick={() => openThemeJson({ kind: 'new-theme' })}>New theme</Button>
        <Button size="sm" onClick={copyJson} disabled={!active}>Copy JSON</Button>
        <Button size="sm" onClick={() => active && downloadText(`osionos-theme-${themeSlug(active.name)}.json`, json())} disabled={!active}>Download</Button>
        <Button size="sm" aria-expanded={importing} onClick={() => setImporting(!importing)}>Import theme</Button>
      </div>
      {importing ? (
        <div className="space-y-2">
          <label className="block text-sm text-[var(--osio-fg-default)]">
            Theme JSON
            <Textarea name="theme-json-import" value={text} onChange={(event) => setText(event.target.value)} rows={6} spellCheck={false} className="mt-1 font-mono text-xs" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" tone="primary" onClick={() => importText(text)}>Import</Button>
            <Button size="sm" onClick={() => fileInput.current?.click()}>Choose file</Button>
            <input
              ref={fileInput}
              hidden
              name="theme-json-file"
              type="file"
              accept="application/json,.json"
              onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }}
            />
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-[var(--osio-danger)]">{error}</p> : null}
    </div>
  );
};

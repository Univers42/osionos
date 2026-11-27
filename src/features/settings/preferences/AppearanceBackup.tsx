import React, { useState } from 'react';

import { Button, Input, Textarea } from '@/shared/ui';
import { DEFAULT_APPEARANCE, DEFAULT_PALETTE, updateAppearance } from '@/shared/config/theme';
import { useAppearance } from '@/features/theme/AppearanceControls';
import {
  diffFromDefault,
  exportAppearance,
  importAppearance,
  MAX_IMPORT_CHARS,
} from '@/features/theme/model/appearanceTransfer';
import type { ThemeSelection } from '@/features/theme/model/useThemeSelection';
import { ConfirmModal } from '../ui/ConfirmModals';
import { Section, SettingRow } from '../ui/settingsKit';

const plural = (count: number) => `${count} setting${count === 1 ? '' : 's'}`;

/** Offers `text` as a file download through a short-lived object URL. */
function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * "Your appearance": how many settings differ from the default, copy / download the whole
 * appearance as JSON, apply JSON from text or a file, and reset everything in one place.
 */
export const AppearanceBackup: React.FC<{ theme: ThemeSelection }> = ({ theme }) => {
  const [appearance] = useAppearance();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);

  const differing =
    Object.keys(diffFromDefault(appearance)).length + (theme.palette === DEFAULT_PALETTE ? 0 : 1) + (theme.mode === 'system' ? 0 : 1);
  const exported = () => exportAppearance({ appearance, palette: theme.palette, mode: theme.mode });
  const report = (ok: string, bad = '') => {
    setMessage(ok);
    setError(bad);
  };

  const copy = () => {
    const write = globalThis.navigator?.clipboard?.writeText(exported());
    if (write) write.then(() => report('Appearance copied'), () => report('', 'Could not copy. Use Download instead.'));
    else report('', 'Copying is not available here. Use Download instead.');
  };

  const apply = (source: string) => {
    const result = importAppearance(source);
    if (!result.ok) return report('', result.error);
    updateAppearance(result.appearance);
    if (result.palette) theme.selectPalette(result.palette);
    if (result.mode) theme.selectMode(result.mode);
    setText('');
    report(`Imported ${plural(result.count)}`);
  };

  const applyFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_CHARS) return report('', `That file is too long: the limit is ${MAX_IMPORT_CHARS} characters.`);
    apply(await file.text());
  };

  const reset = () => {
    updateAppearance(DEFAULT_APPEARANCE);
    theme.selectPalette(DEFAULT_PALETTE);
    theme.selectMode('system');
    setConfirming(false);
    report('Appearance reset');
  };

  return (
    <Section title="Your appearance" anchor="appearance-backup">
      <p className="mb-3 text-sm opacity-70">
        {differing === 0 ? 'Everything is at its default.' : `${plural(differing)} ${differing === 1 ? 'differs' : 'differ'} from the default.`}
      </p>
      <SettingRow
        title="Export"
        description="Copy or download your appearance as JSON to keep it or use it on another device."
        action={(
          <>
            <Button onClick={copy}>Copy as JSON</Button>
            <Button onClick={() => downloadText('osionos-appearance.json', exported())}>Download</Button>
          </>
        )}
      />
      <SettingRow
        title="Import"
        description="Apply an appearance you exported before. Anything it does not set stays at its default."
        action={<Button aria-expanded={importing} onClick={() => setImporting(!importing)}>Import JSON</Button>}
      />
      {importing ? (
        <div className="space-y-3 pb-3">
          <label className="block text-sm">
            Appearance JSON
            <Textarea
              name="appearance-json"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              spellCheck={false}
            className="mt-1 font-mono text-xs"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button tone="primary" onClick={() => apply(text)}>Apply</Button>
            <label className="text-sm">
              <span className="mr-2">Or import a file</span>
              <Input name="appearance-file" type="file" accept="application/json" onChange={(event) => void applyFile(event.target.files?.[0])} className="h-auto w-auto border-0 bg-transparent px-0 text-xs" />
            </label>
          </div>
        </div>
      ) : null}
      <p role="status" className="min-h-5 pb-2 text-sm">{message}</p>
      {error ? <p role="alert" className="pb-2 text-sm text-[var(--osio-danger)]">{error}</p> : null}
      <SettingRow
        title="Reset appearance"
        description="Put every appearance setting back to its default. Your pages are not changed."
        action={<Button onClick={() => setConfirming(true)}>Reset appearance</Button>}
      />
      {confirming ? (
        <ConfirmModal
          title="Reset appearance"
          message="This restores style, colors, layout, motion and accessibility display settings, the color theme and light/dark mode to their defaults. Your pages are not changed."
          actionLabel="Reset"
          onConfirm={reset}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </Section>
  );
};

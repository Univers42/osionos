/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageSettingsPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef } from 'react';
import { Copy, FileDown, FileText, Globe, Import, Sparkles, Trash2 } from 'lucide-react';

import { usePageStore } from '@/store/usePageStore';
import { TRANSLATION_LANGUAGES, fontSampleClass, usePageActions } from '@/entities/page';
import { recordSettingsAction } from '@/store/settings';
import { Button, Dropdown, Toggle } from '@/shared/ui';
import { Section, SettingRow } from '../ui/settingsKit';
import { runMaybeAsync } from '../model/settingsCalls';

export const PageSettingsPanel = () => {
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
        <SettingRow title={<span className="inline-flex items-center gap-2"><Trash2 size={16} />Move to Trash</span>} action={<Button tone="danger-subtle" onClick={() => runMaybeAsync(actions.moveToTrash())}>Move</Button>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Globe size={16} />Present</span>} description="Beta · Ctrl+Alt+P" action={<Toggle checked={actions.config.presentationMode} onChange={() => runMaybeAsync(actions.present())} label="Present" />} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Sparkles size={16} />Use with AI</span>} description="Share this page context with osionos AI." action={<Button onClick={() => recordSettingsAction('page_use_with_ai', { pageId: activePage.id })}>Use</Button>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Globe size={16} />Translate</span>} action={<div className="flex gap-2"><Dropdown label="Translate language" value={actions.translateLocale} options={TRANSLATION_LANGUAGES.map((language) => ({ value: language.locale, label: language.label }))} onChange={actions.setTranslateLocale} align="end" width="auto" /><Button onClick={() => runMaybeAsync(actions.translate())}>Translate</Button></div>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><Import size={16} />Import</span>} action={<><input ref={importInputRef} type="file" accept=".json,.md,.markdown,.txt" className="hidden" onChange={handleImport} /><Button onClick={() => importInputRef.current?.click()}>Import</Button></>} />
        <SettingRow title={<span className="inline-flex items-center gap-2"><FileDown size={16} />Export</span>} action={<Button onClick={() => runMaybeAsync(actions.exportPage())}>Export</Button>} />
      </Section>
      <Section title="Page switches"><SettingRow title="Small text" action={<Toggle checked={actions.config.smallText} onChange={() => runMaybeAsync(actions.toggleSmallText())} label="Small text" />} /><SettingRow title="Full width" action={<Toggle checked={actions.config.fullWidth} onChange={() => runMaybeAsync(actions.toggleFullWidth())} label="Full width" />} /><SettingRow title="Lock page" action={<Toggle checked={actions.config.locked} onChange={() => runMaybeAsync(actions.toggleLock())} label="Lock page" />} /></Section>
      <Section title="History & connections">
        <SettingRow title="Updates & analytics" description={`Actions ${actions.config.analytics.actions} · Copies ${actions.config.analytics.copies}`} action={<Button onClick={actions.openAnalytics}>Open</Button>} />
        <SettingRow title="Version history" description={`${actions.versions.length} saved versions`} action={<Button onClick={actions.openVersionHistory}>Open</Button>} />
        <SettingRow title="Notify me" action={<Toggle checked={actions.config.notifications.comments} onChange={() => runMaybeAsync(actions.toggleNotifications())} label="Notify me" />} />
        <SettingRow title="Connections" description={actions.config.connections.length ? actions.config.connections.map((connection) => connection.name).join(', ') : 'None'} action={<Button onClick={() => runMaybeAsync(actions.manageConnections())}>Manage</Button>} />
        <p className="pt-3 text-xs text-[var(--osio-fg-subtle)]">Word count: {actions.wordCount} words · {actions.editedLabel}</p>
      </Section>
    </>
  );
};

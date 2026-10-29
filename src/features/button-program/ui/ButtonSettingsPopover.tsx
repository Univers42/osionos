/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ButtonSettingsPopover.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The settings popover of a button block: label, variant, target, the visual
 * step list, a read-only code view and the last run's log. It is mounted by
 * the editable editor only, and writes the block through the editor's own
 * commit seam, so only someone who may edit the page ever reaches it.
 *
 * Caveat: the log is the last run held in memory by the runner; it is empty
 * after a reload, and it is shown for this block only.
 */

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ButtonBlockReadOnly } from "@/entities/block/ui/ReadOnlyBlock";
import { parseButtonProgram } from "@/entities/block/model/buttonProgram";
import type { Block } from "@/entities/block";
import { Section, SettingRow } from "@/features/settings/ui/settingsKit";
import { getLastRun, subscribeLastRun } from "@/services/button-program/runProgram";
import { CodeSyntaxHighlight, useClickOutside, useEscapeKey } from "@/shared/ui";
import { MENU_PANEL_CLASS } from "@/features/page-management/ui/menuChrome";

import { fromProgram, programJson, toProgram, type DraftStep } from "../model/stepList";
import { ButtonStepList } from "./ButtonStepList";

export const BUTTON_SETTINGS_EVENT = "osionos:button-settings";
const FIELD = "osio-field w-full px-2 text-sm";
const ACTION_BUTTON =
  "rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]";

const initialDraft = (block: Block): DraftStep[] => {
  const parsed = parseButtonProgram(block.buttonProgram);
  return parsed.ok ? fromProgram(parsed.program) : [];
};

const RunLog: React.FC<{ blockId: string }> = ({ blockId }) => {
  const run = useSyncExternalStore(subscribeLastRun, getLastRun);
  if (!run || run.blockId !== blockId) {
    return <p className="text-sm text-[var(--osio-fg-muted)]">Click the button to see what each step did.</p>;
  }
  const { result } = run;
  return (
    <div>
      <ol aria-label="Run log" className="flex flex-col gap-1 text-sm text-[var(--osio-fg-default)]">
        {result.log.map((entry) => (
          <li key={entry.index} data-log-status={entry.status}>
            {`${entry.label}: ${entry.status}${entry.detail ? ` (${entry.detail})` : ""}`}
          </li>
        ))}
      </ol>
      {!result.ok && (
        <p className="mt-1 text-sm text-[var(--osio-danger)]">
          {result.stoppedBy === "budget" ? `Stopped: ${result.limit} limit reached.` : `Stopped: ${result.stoppedBy}.`}
        </p>
      )}
    </div>
  );
};

interface PopoverProps {
  block: Block;
  onSave: (updates: Partial<Block>) => void;
  onClose: () => void;
}

export const ButtonSettingsPopover: React.FC<PopoverProps> = ({ block, onSave, onClose }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [label, setLabel] = useState(block.buttonLabel ?? block.content ?? "");
  const [variant, setVariant] = useState<NonNullable<Block["buttonVariant"]>>(block.buttonVariant ?? "primary");
  const [href, setHref] = useState(block.buttonHref ?? "");
  const [draft, setDraft] = useState<DraftStep[]>(() => initialDraft(block));
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useClickOutside(panelRef, onClose);
  useEscapeKey(onClose);

  const save = () => {
    // The parser is the only gate: an invalid draft never reaches the block.
    const parsed = parseButtonProgram(toProgram(draft));
    if (!parsed.ok) {
      setError(`${parsed.error.path || "program"}: ${parsed.error.message}`);
      return;
    }
    onSave({
      buttonLabel: label.trim() || undefined,
      buttonVariant: variant,
      buttonHref: href.trim() || undefined,
      buttonProgram: parsed.program.steps.length > 0 ? parsed.program : undefined,
    });
    onClose();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Button settings"
      className={`${MENU_PANEL_CLASS} absolute left-0 top-full mt-1 max-h-[70vh] w-[min(34rem,90vw)] overflow-y-auto p-3`}
    >
      <Section title="Button">
        <SettingRow stack title="Label" action={
          <input aria-label="Button label" className={FIELD} value={label} onChange={(event) => setLabel(event.target.value)} />
        } />
        <SettingRow stack title="Style" action={
          <select aria-label="Button style" className={FIELD} value={variant}
            onChange={(event) => setVariant(event.target.value as typeof variant)}>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
          </select>
        } />
        <SettingRow stack title="Opens" description="A page:// link or a /path. Ignored while the button has steps."
          action={<input aria-label="Button target" className={FIELD} value={href} onChange={(event) => setHref(event.target.value)} />} />
      </Section>
      <Section title="Steps" className="mt-3">
        <ButtonStepList draft={draft} onChange={(next) => { setDraft(next); setError(null); }} />
      </Section>
      <Section title="Code" className="mt-3">
        <button type="button" className={ACTION_BUTTON} aria-expanded={showCode} onClick={() => setShowCode((open) => !open)}>
          {showCode ? "Hide code" : "Show code"}
        </button>
        {showCode && (
          <div role="region" aria-label="Program code (read-only)" data-testid="button-code-view" className="mt-2 overflow-auto rounded-md bg-[var(--osio-bg-subtle)] p-2">
            <CodeSyntaxHighlight code={programJson(draft)} language="json" codeClassName="block whitespace-pre font-mono text-xs" />
          </div>
        )}
      </Section>
      <Section title="Last run" className="mt-3">
        <RunLog blockId={block.id} />
      </Section>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--osio-danger)]">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={ACTION_BUTTON} onClick={onClose}>Cancel</button>
        <button type="button" className={`${ACTION_BUTTON} bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]`} onClick={save}>Save</button>
      </div>
    </div>
  );
};

interface HostProps {
  block: Block;
  hostPageId: string;
  onUpdateBlock: (updates: Partial<Block>) => void;
}

/** The editable editor's button: the button itself plus the popover the block menu opens. */
export const ButtonBlockEditor: React.FC<HostProps> = ({ block, hostPageId, onUpdateBlock }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ blockId?: string }>).detail;
      if (detail?.blockId === block.id) setOpen(true);
    };
    globalThis.addEventListener(BUTTON_SETTINGS_EVENT, onOpen);
    return () => globalThis.removeEventListener(BUTTON_SETTINGS_EVENT, onOpen);
  }, [block.id]);

  return (
    <div className="relative">
      <ButtonBlockReadOnly block={block} hostPageId={hostPageId} />
      {open && <ButtonSettingsPopover block={block} onSave={onUpdateBlock} onClose={close} />}
    </div>
  );
};

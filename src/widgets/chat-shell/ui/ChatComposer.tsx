/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChatComposer.tsx                                     :+:      :::    :+:   */
/*                                                    elements  Histories        */
/*   By: dlesieur <dlesieur@student.42.fr>          #+#    #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";
import { ArrowUp, FileText, Layers, Plug, Square, X } from "lucide-react";

import { AiConnectionPicker } from "./AiConnectionPicker";
import type { AiSelection } from "@/features/ai/model/aiSelection";
import { WORKSPACE_CHIP, type ContextChip } from "@/features/ai/model/aiContext";
import { PageSelectorMenu } from "@/features/block-editor/ui/PageSelectorMenu";
import { DictationButton } from "@/features/voice/ui/DictationButton";
import { insertTranscript } from "@/features/voice/model/insertTranscript";
import { dictationLanguage } from "@/features/voice/model/language";
import { usePageStore } from "@/store/usePageStore";
import { useVoiceSettingsStore } from "@/store/settings";
import { useContextPicker } from "../model/useContextPicker";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Opens the "connect a provider" flow (the composer's + affordance). */
  onConnect: () => void;
  /** The connection and the model every run is sent with. */
  selection: AiSelection;
  onSelectionChange: (selection: AiSelection) => void;
  /** The pages (and the workspace) the answer is read from. */
  chips: ContextChip[];
  onChipsChange: (chips: ContextChip[]) => void;
  autoFocus?: boolean;
  /** True while an answer is streaming: the send button becomes a stop. */
  streaming?: boolean;
  /** Stops the answer in flight. */
  onStop?: () => void;
}

/** Controlled composer (parent owns the text so it survives a connect prompt). */
export const ChatComposer: React.FC<Props> = ({
  value,
  onChange,
  onSubmit,
  onConnect,
  selection,
  onSelectionChange,
  chips,
  onChipsChange,
  autoFocus,
  streaming,
  onStop,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 240)}px`; };
  useEffect(() => { if (ref.current) grow(ref.current); }, [value]);

  // The dictation: the transcript lands where the caret is, as typed input.
  // It never submits: the user still presses the key.
  const voice = useVoiceSettingsStore((state) => state.data);
  const applyTranscript = (text: string) => {
    const element = ref.current;
    const caret = element?.selectionStart ?? value.length;
    onChange(insertTranscript(value, text, caret));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(caret + text.length, caret + text.length);
    });
  };

  // What the assistant is pointed at: the "@" picker and the chips.
  const picker = useContextPicker({ value, onChange, chips, onChipsChange });

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // The picker has the keyboard while it is open: Enter picks, Escape closes.
    if (picker.trigger) {
      if (e.key === "Escape") picker.cancel();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  };

  return (
    <div
      data-dictation-composer="assistant"
      className="relative rounded-2xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-sm)] focus-within:border-[var(--osio-accent)]"
    >
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2" data-testid="ai-context-chips">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex max-w-56 items-center gap-1 rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-0.5 text-2xs text-[var(--osio-fg-default)]"
            >
              {chip.kind === "workspace" ? <Layers size={12} /> : <FileText size={12} />}
              <span className="truncate">{chip.label}</span>
              <button
                type="button"
                aria-label={`Remove ${chip.label}`}
                onClick={() => picker.remove(chip.id)}
                className="text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {picker.hint ? (
        <p className="px-3 pt-1.5 text-2xs text-[var(--osio-fg-muted)]" data-testid="ai-context-hint">{picker.hint}</p>
      ) : null}
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => { onChange(e.target.value); picker.sync(e.target, e.target.value); }}
        onSelect={(e) => picker.sync(e.currentTarget, value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Do anything with AI…"
        aria-label="Message the assistant"
        className="block w-full resize-none bg-transparent px-4 pt-3 text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
      />
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <button
          type="button"
          onClick={onConnect}
          aria-label="Connect a model"
          title="Connect your own model (Settings › AI connections)"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        >
          <Plug size={16} /> Connect
        </button>
        <AiConnectionPicker value={selection} onChange={onSelectionChange} />
        <DictationButton onText={applyTranscript} language={dictationLanguage(voice)} />
        {streaming ? (
          <button
            type="button"
            aria-label="Stop the answer"
            onClick={() => onStop?.()}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--osio-border-default)] px-3 py-1.5 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
          >
            <Square size={12} /> Stop
          </button>
        ) : (
          <button
            type="button"
            aria-label="Send message"
            onClick={onSubmit}
            disabled={!value.trim()}
            className="ml-auto rounded-full bg-[var(--osio-accent)] p-2 text-[var(--osio-accent-fg)] transition-colors hover:bg-[var(--osio-accent-hover,var(--osio-accent))] disabled:opacity-40"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
      {picker.trigger && picker.position ? (
        <PageSelectorMenu
          position={picker.position}
          filter={picker.trigger.query}
          heading="Pages the answer may read"
          onSelect={(pageId) => {
            const page = usePageStore.getState().pageById(pageId);
            picker.pick({ id: pageId, kind: "page", label: page?.title || "Untitled", pageId });
          }}
          leading={{ label: WORKSPACE_CHIP.label, onSelect: () => picker.pick(WORKSPACE_CHIP) }}
          onClose={() => picker.close()}
        />
      ) : null}
    </div>
  );
};

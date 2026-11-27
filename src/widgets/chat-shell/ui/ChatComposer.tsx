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

import React, { useEffect, useRef, useState } from "react";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

import { AiConnectionPicker } from "./AiConnectionPicker";
import { OfflineModelPicker } from "./OfflineModelPicker";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { AttachButton } from "./AttachButton";
import { ResearchToggle, WebToggle } from "./WebToggle";
import { ComposerCard } from "@/shared/ui/composer/ComposerCard";
import { AgentChip } from "./AgentChip";
import { ComposerChips } from "./ComposerChips";
import { ComposerSendStop } from "./ComposerSendStop";
import { ComposerPlus } from "./ComposerPlus";
import { ConnectedModeMenu } from "./ModeMenu";
import { isFeatureFlagEnabled } from "@/shared/config/featureFlags";
import type { AiSelection } from "@/features/ai/model/aiSelection";
import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { WORKSPACE_CHIP, type ContextChip } from "@/features/ai/model/aiContext";
import { minimalReplacement, type MarkdownMarker, shortcutMarker, wrapSelection } from "@/features/chat/model/composerMarkdown";
import { PreviewToggle, UserMarkdown } from "@/features/chat/ui/UserMarkdown";
import { runError } from "@/features/chat/model/runErrors";
import type { ComposerAttachment } from "@/features/chat/model/assistantHandoff";
import { PageSelectorMenu } from "@/features/block-editor/ui/PageSelectorMenu";
import { DictationButton } from "@/features/voice/ui/DictationButton";
import { insertTranscript } from "@/features/voice/model/insertTranscript";
import { dictationLanguage } from "@/features/voice/model/language";
import { usePageStore } from "@/store/usePageStore";
import { useVoiceSettingsStore } from "@/store/settings";
import { SlashPalette, SLASH_LISTBOX_ID, slashOptionId } from "@/features/ai/ui/SlashPalette";
import { PANEL_MIN } from "@/features/chat/model/agentPanel";
import { AgentPanelRow } from "./AgentPanelRow";
import { useContextPicker } from "../model/useContextPicker";
import { useSlashPalette } from "../model/useSlashPalette";

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
  /** The agents the service offers: the built-ins, then the caller's custom ones. */
  agents?: AgentSummary[];
  /** The agent of the next run, or none (the general assistant). */
  agentId?: string | null;
  /** The reader picked another agent. */
  onAgentChange?: (agentId: string | null) => void;
  /** The agents of the panel, in order; two or three make it active. */
  panel?: string[];
  onPanelChange?: (agentIds: string[]) => void;
  autoFocus?: boolean;
  /** Changes when the composer should take the focus back, the caret after the text (a starter was picked). */
  focusSignal?: number;
  /** True while an answer is streaming: the send button becomes a stop. */
  streaming?: boolean;
  /** Stops the answer in flight. */
  onStop?: () => void;
  /** The workspace switch of the web tools is on: only then is the "Web" toggle drawn. */
  webAvailable?: boolean;
  /** The service offers research mode: the "Research" toggle is drawn next to "Web". */
  researchAvailable?: boolean;
  /** The attached image paths. */
  attachments?: ComposerAttachment[];
  /** Replaces the attached image list. */
  onAttachmentsChange?: (attachments: ComposerAttachment[]) => void;
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
  agents = [],
  agentId = null,
  onAgentChange,
  panel = [],
  onPanelChange,
  autoFocus,
  focusSignal,
  streaming,
  onStop,
  webAvailable = false,
  researchAvailable = false,
  attachments = [],
  onAttachmentsChange,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const panelMembers = panel.flatMap((id) => agents.find((agent) => agent.id === id) ?? []);
  const [vision, setVision] = useState<boolean | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [attachSignal, setAttachSignal] = useState(0);
  const pushToast = useToastStore((s) => s.push);
  const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 240)}px`; };
  useEffect(() => { if (ref.current) grow(ref.current); }, [value, previewing]);
  useEffect(() => {
    const element = ref.current;
    if (!focusSignal || !element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [focusSignal]);

  useEffect(() => {
    if (vision !== false || !attachments.some((attachment) => attachment.kind === "image")) return;
    onAttachmentsChange?.(attachments.filter((attachment) => attachment.kind !== "image"));
    pushToast({ kind: "info", title: runError("model_no_vision").text });
  }, [attachments, onAttachmentsChange, pushToast, vision]);

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

  const picker = useContextPicker({ value, onChange, chips, onChipsChange });

  const mentionPage = () => {
    const element = ref.current;
    const caret = element?.selectionStart ?? value.length;
    const lead = caret > 0 && !/\s/.test(value[caret - 1] ?? "") ? " " : "";
    const next = `${value.slice(0, caret)}${lead}@${value.slice(caret)}`;
    const after = caret + lead.length + 1;
    setPreviewing(false);
    onChange(next);
    requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      element.setSelectionRange(after, after);
      picker.sync(element, next);
    });
  };

  const rootRef = useRef<HTMLDivElement>(null);
  const slash = useSlashPalette({
    value, onChange, onSubmit, textarea: ref, root: rootRef, syncPicker: picker.sync,
    onAttach: () => setAttachSignal((n) => n + 1),
  });
  const activeCommand = slash.open ? slash.matches[slash.index] : undefined;

  const applyMarkdown = (element: HTMLTextAreaElement, marker: MarkdownMarker) => {
    const edit = wrapSelection(element.value, element.selectionStart, element.selectionEnd, marker);
    const { from, to, text } = minimalReplacement(element.value, edit.value);
    element.focus();
    element.setSelectionRange(from, to);
    const typed = typeof document.execCommand === "function"
      && (text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, text));
    if (!typed) onChange(edit.value);
    requestAnimationFrame(() => element.setSelectionRange(edit.selectionStart, edit.selectionEnd));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.onKeyDown(e)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const marker = shortcutMarker(e.key, e.shiftKey);
      if (marker) { e.preventDefault(); applyMarkdown(e.currentTarget, marker); return; }
    }
    if (picker.trigger) {
      if (e.key === "Escape") picker.cancel();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); slash.submit(); }
  };

  return (
    <ComposerCard ref={rootRef} data-dictation-composer="assistant">
      <ComposerChips chips={chips} hint={picker.hint} onRemove={picker.remove} />
      {previewing && value.trim() ? (
        <div className="max-h-60 overflow-y-auto px-4 pt-3 text-sm text-[var(--osio-fg-default)]" data-testid="composer-preview">
          <UserMarkdown markdown={value} />
        </div>
      ) : (
      <textarea name="message-the-assistant"
        data-writing-surface
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => { setPreviewing(false); onChange(e.target.value); picker.sync(e.target, e.target.value); slash.sync(e.target, e.target.value); }}
        onSelect={(e) => { picker.sync(e.currentTarget, value); slash.sync(e.currentTarget, value); }}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Ask osionos AI…"
        aria-label="Message the assistant"
        aria-controls={slash.open ? SLASH_LISTBOX_ID : undefined}
        aria-expanded={slash.open ? true : undefined}
        aria-activedescendant={activeCommand ? slashOptionId(activeCommand.name) : undefined}
        className="block w-full resize-none bg-transparent px-4 pt-3 text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
      />
      )}
      <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 pt-1">
        <div data-composer-slot="attach" className="contents">
          <ComposerPlus
            onAttach={() => setAttachSignal((n) => n + 1)}
            onMention={mentionPage}
            onConnect={onConnect}
          />
          <AttachButton
            hideButton
            openSignal={attachSignal}
            vision={vision === true}
            attachments={attachments}
            onChange={(next) => onAttachmentsChange?.(next)}
          />
        </div>
        {agents.length > 0 ? <AgentChip agents={agents} agentId={agentId} onChange={onAgentChange} panel={panel} onPanelChange={onPanelChange} /> : null}
        {onPanelChange && panelMembers.length >= PANEL_MIN ? <AgentPanelRow members={panelMembers} onClear={() => onPanelChange([])} /> : null}
        {isFeatureFlagEnabled("osio.ai.modes") ? <ConnectedModeMenu /> : null}
        {webAvailable ? <WebToggle /> : null}
        {webAvailable && researchAvailable ? <ResearchToggle /> : null}
        {value.trim() ? (
          <PreviewToggle pressed={previewing} onToggle={() => setPreviewing((on) => !on)} />
        ) : null}
        <DictationButton onText={applyTranscript} language={dictationLanguage(voice)} />
        <div data-composer-slot="model" className="ml-auto flex items-center gap-1.5">
          {isAiConfigured() ? (
            <AiConnectionPicker
              value={selection}
              onChange={onSelectionChange}
              onVisionChange={setVision}
            />
          ) : (
            <OfflineModelPicker value={selection} onChange={onSelectionChange} />
          )}
          <ComposerSendStop streaming={streaming} canSend={Boolean(value.trim())} onSend={slash.submit} onStop={onStop} />
        </div>
      </div>
      {slash.open ? (
        <SlashPalette
          commands={slash.matches}
          query={slash.query}
          index={slash.index}
          placement={slash.placement}
          onHover={slash.setIndex}
          onPick={slash.pick}
        />
      ) : null}
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
    </ComposerCard>
  );
};

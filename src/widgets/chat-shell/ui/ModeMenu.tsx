/**
 * The composer's assist-mode picker: a native select, so the keyboard, the
 * typeahead and the accessible name come with it. "Accept edits" needs an open
 * page (its anchor), so it is disabled while none is.
 */

import React from "react";

import { Select } from "@/shared/ui";
import { ASSIST_MODES, type AssistMode } from "@/features/chat/model/assistMode";
import { useAssistMode } from "@/features/chat/model/useAssistMode";
import { useChatStore } from "@/features/chat/model/useChatStore";
import { usePageStore } from "@/store/usePageStore";

interface Props {
  conversationId: string;
  openPageId: string | null;
  value: AssistMode;
  onChange(mode: AssistMode): void;
  /** True until the stored mode is known: a guess would misstate it. */
  disabled?: boolean;
}

export function ModeMenu({ openPageId, value, onChange, disabled = false }: Props): React.JSX.Element {
  const noAnchor = openPageId === null;
  return (
    <span className="inline-flex flex-col">
      <Select
        aria-label="Assistant mode"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as AssistMode)}
        className="h-8 w-auto text-xs"
      >
        {ASSIST_MODES.map(({ mode, label }) => (
          <option key={mode} value={mode} disabled={mode === "accept_edits" && noAnchor}>{label}</option>
        ))}
      </Select>
      {noAnchor ? <span className="px-1 text-2xs text-[var(--osio-fg-muted)]">Open a page to use it as the anchor</span> : null}
    </span>
  );
}

function LoadedModeMenu({ serverId, openPageId }: { serverId: string; openPageId: string | null }): React.JSX.Element | null {
  const { mode, error, hidden, ready, choose } = useAssistMode(serverId, openPageId);
  if (hidden) return null;
  return (
    <span className="inline-flex flex-col" data-testid="ai-mode-menu">
      <ModeMenu conversationId={serverId} disabled={!ready} openPageId={openPageId} value={mode} onChange={(next) => void choose(next)} />
      {error ? <span role="alert" className="px-1 text-2xs text-[var(--osio-danger)]">{error}</span> : null}
    </span>
  );
}

/** The menu wired to the open conversation and page; draws nothing without a server conversation. Keyed by the conversation so its state never leaks across. */
export function ConnectedModeMenu(): React.JSX.Element | null {
  const serverId = useChatStore((s) => s.conversations.find((c) => c.id === s.activeConversationId)?.serverConversationId ?? null);
  const openPageId = usePageStore((s) => s.activePage?.id ?? null);
  return serverId ? <LoadedModeMenu key={serverId} serverId={serverId} openPageId={openPageId} /> : null;
}

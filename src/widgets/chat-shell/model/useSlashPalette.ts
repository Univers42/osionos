/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSlashPalette.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The composer's "/" palette: the commands, the open state, the keys, and what
 * each pick does. The composer hands over its text, its textarea and its root;
 * the pure rules live in features/ai/model/chatCommands.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listCommands, type AiCommand } from "@/features/ai/api/aiClient";
import { openAiHub, type HubSectionId } from "@/features/ai/model/aiHubNav";
import {
  CHAT_ACTIONS,
  expandSlashText,
  filterCommands,
  mergeCommands,
  paletteKey,
  slashQuery,
  type ChatCommand,
} from "@/features/ai/model/chatCommands";
import { useChatStore } from "@/features/chat/model/useChatStore";

/** The service's chat commands — fetched ONCE per session; a failure leaves the actions. */
let serviceCommands: Promise<AiCommand[]> | null = null;
function loadServiceCommands(): Promise<AiCommand[]> {
  serviceCommands ??= listCommands("chat").catch(() => []);
  return serviceCommands;
}

const EFFORT_GROUP = '[role="radiogroup"][aria-label="Reasoning effort"]';
const HUB_ACTIONS: Record<string, HubSectionId> = { skills: "skills", memory: "memory", mcp: "mcp", routing: "routing", hub: "overview" };

const FOCUSABLE = 'button, select, input, [href], [tabindex]:not([tabindex="-1"])';

interface Options {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  root: React.RefObject<HTMLElement | null>;
  /** Re-reads the "@" at the caret, so the "context" action opens its picker. */
  syncPicker: (element: HTMLTextAreaElement, text: string) => void;
}

export function useSlashPalette({ value, onChange, onSubmit, textarea, root, syncPicker }: Options) {
  const [fetched, setFetched] = useState<AiCommand[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  // Escape closes the palette for this text; the next edit may reopen it.
  const dismissedText = useRef<string | null>(null);
  const latestSubmit = useRef(onSubmit);
  latestSubmit.current = onSubmit;

  const commands = useMemo(() => mergeCommands(CHAT_ACTIONS, fetched), [fetched]);
  // Caveat: read from the DOM when the query changes; a model switch with the palette
  // open shows /effort stale until the next keystroke.
  const matches = useMemo(
    () => query === null ? [] : filterCommands(commands, query, (name) => name !== "effort" || !!root.current?.querySelector(EFFORT_GROUP)),
    [commands, query, root],
  );
  const open = query !== null;

  const sync = useCallback((element: HTMLTextAreaElement, text: string) => {
    const next = text === dismissedText.current ? null : slashQuery(text, element.selectionStart ?? text.length);
    if (next !== null) {
      void loadServiceCommands().then(setFetched);
      const rect = element.getBoundingClientRect();
      setPlacement(globalThis.innerHeight - rect.bottom < 300 ? "above" : "below");
    }
    setQuery((previous) => {
      if (previous !== next) setIndex(0);
      return next;
    });
  }, []);

  // A text change from outside (a send, a new conversation) closes the palette.
  useEffect(() => {
    if (query !== null && slashQuery(value, value.length) === null) setQuery(null);
  }, [query, value]);

  const write = useCallback(
    (text: string, caret = text.length) => {
      onChange(text);
      requestAnimationFrame(() => {
        const element = textarea.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(caret, caret);
        syncPicker(element, text);
        sync(element, text);
      });
    },
    [onChange, sync, syncPicker, textarea],
  );

  const focusSlot = useCallback(
    (selector: string, inside = false) => {
      const found = root.current?.querySelector<HTMLElement>(selector);
      const target = inside ? found?.querySelector<HTMLElement>(FOCUSABLE) : found;
      target?.focus();
    },
    [root],
  );

  const pick = useCallback(
    (command: ChatCommand) => {
      setQuery(null);
      if (command.kind === "prompt") {
        write(`/${command.name} `);
        return;
      }
      if (command.name === "help") {
        write("/");
        return;
      }
      dismissedText.current = null;
      onChange("");
      if (command.name === "new") useChatStore.getState().createConversation();
      else if (command.name === "context") write("@");
      else if (Object.hasOwn(HUB_ACTIONS, command.name)) openAiHub(HUB_ACTIONS[command.name]);
      else requestAnimationFrame(() => {
        if (command.name === "model") focusSlot('[data-composer-slot="model"]', true);
        else if (command.name === "agent") focusSlot('select[aria-label="Agent"]');
        else if (command.name === "effort") focusSlot(`${EFFORT_GROUP} [role="radio"][aria-checked="true"]`);
        else if (command.name === "attach") focusSlot('[data-composer-slot="attach"] button');
      });
    },
    [focusSlot, onChange, write],
  );

  /** True when the palette took the key. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const step = paletteKey({ open, index, count: matches.length }, event.key);
    if (!step.handled) return false;
    event.preventDefault();
    setIndex(step.index);
    if (event.key === "Escape") {
      dismissedText.current = value;
      setQuery(null);
    }
    if (step.pick !== undefined) pick(matches[step.pick]);
    return true;
  };

  /** Sends the text, expanding a known "/prompt args" first. */
  const submit = () => {
    const expanded = expandSlashText(value, commands);
    if (expanded === null) {
      onSubmit();
      return;
    }
    // The parent's onSubmit reads its own state and takes no argument, so the
    // expanded text goes in first and the send follows on the next frame.
    onChange(expanded);
    requestAnimationFrame(() => latestSubmit.current());
  };

  return { open, matches, query: query ?? "", index, placement, setIndex, sync, pick, onKeyDown, submit };
}

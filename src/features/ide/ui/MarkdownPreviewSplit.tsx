/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarkdownPreviewSplit.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/06 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/06 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Code2, Columns2, Eye } from "lucide-react";
import { ErrorBoundary } from "@osionos/ui/atoms/ErrorBoundary";

import type { RawLayoutMode } from "@/features/raw-mode/model/rawModeLayout";
import { startPaneDrag } from "@/features/raw-mode/ui/startPaneDrag";
import type { PreviewFlavor } from "../model/markdownPreview";
import {
  PREVIEW_TOGGLE_ARIA,
  choosePreviewMode,
  isMacPlatform,
  isPreviewToggleKey,
  toggledPreviewView,
  type PreviewView,
} from "../model/previewKeys";

const PREVIEW_DEBOUNCE_MS = 90;
const IS_MAC = typeof navigator !== "undefined" && isMacPlatform(navigator.userAgent);
const TOGGLE_HINT = IS_MAC ? "⌘⇧V" : "Ctrl+Shift+V";
const TABS: ReadonlyArray<{ mode: RawLayoutMode; label: string; Icon: typeof Code2 }> = [
  { mode: "code", label: "Code", Icon: Code2 },
  { mode: "split", label: "Split", Icon: Columns2 },
  { mode: "preview", label: "Preview", Icon: Eye },
];

/**
 * Opens on the code: the preview is one shortcut away (Ctrl+Shift+V, Cmd+Shift+V on a Mac).
 * Caveat: when a rename turns the preview on (or another file opens in this view), the
 * preview restarts from the store's text, which trails the editor by its save debounce;
 * the next keystroke or model rebuild brings it level.
 */
export function useMarkdownPreview(flavor: PreviewFlavor | null, readInitialText: () => string) {
  const [view, setView] = React.useState<PreviewView>({ mode: "code", returnTo: "code" });
  const [source, setSource] = React.useState(readInitialText);
  const [origin, setOrigin] = React.useState({ flavor, readInitialText });
  if (origin.flavor !== flavor || origin.readInitialText !== readInitialText) {
    setOrigin({ flavor, readInitialText });
    setSource(readInitialText());
  }
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onText = React.useCallback((text: string) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      React.startTransition(() => setSource(text));
    }, PREVIEW_DEBOUNCE_MS);
  }, []);
  React.useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);
  const setMode = React.useCallback((mode: RawLayoutMode) => setView((current) => choosePreviewMode(current, mode)), []);
  const toggle = React.useCallback(() => setView(toggledPreviewView), []);
  return { mode: view.mode, setMode, toggle, source, onText: flavor === null ? undefined : onText };
}

interface PreviewModeToggleProps {
  mode: RawLayoutMode;
  onMode: (mode: RawLayoutMode) => void;
  buttonClass: string;
}

export function PreviewModeToggle({ mode, onMode, buttonClass }: Readonly<PreviewModeToggleProps>) {
  return (
    <div role="group" aria-label="Preview mode" className="flex items-center gap-0.5">
      {TABS.map(({ mode: tab, label, Icon }) => (
        <button
          key={tab}
          type="button"
          aria-pressed={mode === tab}
          title={tab === "preview" ? `Preview (${TOGGLE_HINT} toggles)` : undefined}
          onClick={() => onMode(tab)}
          className={`${buttonClass} ${mode === tab ? "bg-[var(--osio-code-btn-active)] text-[var(--osio-code-fg)]" : ""}`}
        >
          <Icon size={12} aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

function useSplitRatio() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = React.useState(0.5);
  const startDividerDrag = React.useCallback((event: React.PointerEvent) => {
    startPaneDrag(event, containerRef.current, setRatio);
  }, []);
  return { containerRef, ratio, startDividerDrag };
}

// Focus follows the shortcut only, never a click on Code/Split/Preview: the button the
// user just pressed keeps it.
function useToggleFocus(mode: RawLayoutMode, focusEditor: () => void) {
  const regionRef = React.useRef<HTMLDivElement | null>(null);
  const pendingRef = React.useRef(false);
  React.useEffect(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    if (mode === "preview") regionRef.current?.focus();
    else focusEditor();
  }, [mode, focusEditor]);
  return { regionRef, pendingRef };
}

interface MarkdownPreviewSplitProps {
  flavor: PreviewFlavor | null;
  mode: RawLayoutMode;
  onToggle: () => void;
  focusEditor: () => void;
  preview: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The same element tree for every file, previewable or not: Monaco binds to its host div once
 * per model, so a rename that turns the preview on or off must not replace that div.
 * The shortcut is caught in the capture phase, before Monaco's textarea sees it, and the
 * aria-keyshortcuts claim makes the app's own dispatcher (paste-plain) yield it.
 */
export function MarkdownPreviewSplit({ flavor, mode: chosenMode, onToggle, focusEditor, preview, children }: Readonly<MarkdownPreviewSplitProps>) {
  const { containerRef, ratio, startDividerDrag } = useSplitRatio();
  const mode = flavor === null ? "code" : chosenMode;
  const { regionRef, pendingRef } = useToggleFocus(mode, focusEditor);
  const editorClass = mode === "preview" ? "hidden" : `min-h-0 min-w-0 ${mode === "split" ? "shrink-0" : "flex-1"}`;
  const onKeyDownCapture = (event: React.KeyboardEvent) => {
    if (flavor === null || !isPreviewToggleKey(event.nativeEvent, IS_MAC)) return;
    event.preventDefault();
    event.stopPropagation();
    pendingRef.current = true;
    onToggle();
  };

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1" aria-keyshortcuts={flavor === null ? undefined : PREVIEW_TOGGLE_ARIA} onKeyDownCapture={onKeyDownCapture}>
      <div className={editorClass} style={mode === "split" ? { flexBasis: `${ratio * 100}%` } : undefined}>
        {children}
      </div>
      {mode === "split" && (
        <button type="button" aria-label="Resize panes" onPointerDown={startDividerDrag} className="w-1 shrink-0 cursor-col-resize bg-[var(--osio-code-border)] hover:bg-[var(--osio-accent)]" />
      )}
      {mode !== "code" && (
        <div ref={regionRef} role="region" aria-label="Preview" tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--osio-accent)]">
          <ErrorBoundary>{preview}</ErrorBoundary>
        </div>
      )}
    </div>
  );
}

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

import type { Block } from "@/entities/block";
import type { RawLayoutMode } from "@/features/raw-mode/model/rawModeLayout";
import { startPaneDrag } from "@/features/raw-mode/ui/startPaneDrag";
import type { PreviewFlavor } from "../model/markdownPreview";

const PREVIEW_DEBOUNCE_MS = 90;
const TABS: ReadonlyArray<{ mode: RawLayoutMode; label: string; Icon: typeof Code2 }> = [
  { mode: "code", label: "Code", Icon: Code2 },
  { mode: "split", label: "Split", Icon: Columns2 },
  { mode: "preview", label: "Preview", Icon: Eye },
];

const MarkdownPreview = React.lazy(() =>
  import("@/features/raw-mode/ui/RawPreviewPane").then((m) => ({ default: m.RawPreviewPane })));
const OmdPreview = React.lazy(async () => {
  const [{ RawPreviewPane }, { fileToPage }] = await Promise.all([
    import("@/features/raw-mode/ui/RawPreviewPane"),
    import("@/features/page-file/model/pageFileCodec"),
  ]);
  // Built once per module load: a stable parse keeps RawPreviewPane's memo effective.
  const parse = (text: string): Block[] => fileToPage(text).content;
  return { default: ({ source }: Readonly<{ source: string }>) => <RawPreviewPane source={source} parse={parse} /> };
});

/**
 * Caveat: when a rename turns the preview on (or another file opens in this view), the
 * preview restarts from the store's text, which trails the editor by its save debounce;
 * the next keystroke or model rebuild brings it level.
 */
export function useMarkdownPreview(flavor: PreviewFlavor | null, readInitialText: () => string) {
  const [mode, setMode] = React.useState<RawLayoutMode>("split");
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
  return { mode, setMode, source, onText: flavor === null ? undefined : onText };
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

interface MarkdownPreviewSplitProps {
  flavor: PreviewFlavor | null;
  mode: RawLayoutMode;
  source: string;
  children: React.ReactNode;
}

/**
 * The same element tree for every file, previewable or not: Monaco binds to its host div once
 * per model, so a rename that turns the preview on or off must not replace that div.
 */
export function MarkdownPreviewSplit({ flavor, mode: chosenMode, source, children }: Readonly<MarkdownPreviewSplitProps>) {
  const { containerRef, ratio, startDividerDrag } = useSplitRatio();
  const mode = flavor === null ? "code" : chosenMode;
  const editorClass = mode === "preview" ? "hidden" : `min-h-0 min-w-0 ${mode === "split" ? "shrink-0" : "flex-1"}`;

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      <div className={editorClass} style={mode === "split" ? { flexBasis: `${ratio * 100}%` } : undefined}>
        {children}
      </div>
      {mode === "split" && (
        <button type="button" aria-label="Resize panes" onPointerDown={startDividerDrag} className="w-1 shrink-0 cursor-col-resize bg-[var(--osio-code-border)] hover:bg-[var(--osio-accent)]" />
      )}
      {mode !== "code" && (
        <div className="min-h-0 min-w-0 flex-1">
          <React.Suspense fallback={null}>
            {flavor === "omd" ? <OmdPreview source={source} /> : <MarkdownPreview source={source} />}
          </React.Suspense>
        </div>
      )}
    </div>
  );
}

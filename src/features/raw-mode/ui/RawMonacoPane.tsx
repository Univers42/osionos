/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RawMonacoPane.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Advanced console: raw mode's code pane on Monaco, with completion and hover on `:::`
// openers and a marker on every attribute the save would drop (ADR 0064 PS22, PS23). Only
// RawSourcePane imports it, through import(), so Monaco stays out of the entry chunk.
//
// Uncontrolled like the textarea: the model owns the text, every change is reported to the
// raw-mode hook, nothing is pushed back while mounted, and a remount reads the live text.
import React, { useEffect, useMemo, useRef } from "react";
import { useLayoutModes } from "@/entities/block/ui/layoutModes";
import { editor, Uri } from "@/features/ide/model/monacoRuntime";
import { loadMonacoLanguage } from "@/features/ide/model/monacoLanguages";
import { editorFontFamily, OSIO_THEME, watchEditorTheme } from "@/features/ide/ui/monacoTheme";
import { EDITOR_OPTIONS, prefersReducedMotion } from "@/features/ide/ui/useMonacoEditor";
import { consoleDiagnostics } from "../model/consoleDiagnostics";
import { RAW_CONSOLE_SCHEME, registerRawConsoleProviders, setConsoleLayoutModes, setConsoleMarkers } from "./rawConsoleMonaco";

export interface RawMonacoPaneProps {
  readSource: () => string;
  onChange: (next: string) => void;
  /** The debounced text the preview shows; the markers are computed on it. */
  checkSource: string;
  showLineNumbers: boolean;
}

type EditorRef = React.RefObject<editor.IStandaloneCodeEditor | null>;

let modelSerial = 0;

function createConsoleModel(text: string): editor.ITextModel {
  modelSerial += 1;
  const model = editor.createModel(text, "plaintext", Uri.from({ scheme: RAW_CONSOLE_SCHEME, path: `/source-${modelSerial}.md` }));
  // Monaco's default line ending follows the user agent; the save's parse expects "\n".
  model.setEOL(editor.EndOfLineSequence.LF);
  void loadMonacoLanguage("markdown").then(() => {
    if (!model.isDisposed()) editor.setModelLanguage(model, "markdown");
  });
  return model;
}

function useConsoleEditor(hostRef: React.RefObject<HTMLDivElement | null>, readSource: () => string, onChange: (next: string) => void): EditorRef {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    registerRawConsoleProviders();
    const stopTheme = watchEditorTheme(host);
    const model = createConsoleModel(readSource());
    const instance = editor.create(host, {
      ...EDITOR_OPTIONS, model, theme: OSIO_THEME, fontFamily: editorFontFamily(host),
      ariaLabel: "Raw markdown source", cursorBlinking: prefersReducedMotion() ? "solid" : "blink",
    });
    const subscription = model.onDidChangeContent(() => onChangeRef.current(model.getValue()));
    editorRef.current = instance;
    return () => {
      subscription.dispose();
      stopTheme();
      instance.dispose();
      // The marker service is global and keeps a disposed model's markers under its URI.
      editor.setModelMarkers(model, RAW_CONSOLE_SCHEME, []);
      model.dispose();
      editorRef.current = null;
    };
  }, [hostRef, readSource]);
  return editorRef;
}

/** Markers only on the text they were computed on: a line number is wrong for any other. */
function useConsoleMarkers(editorRef: EditorRef, checkSource: string): number {
  const diagnostics = useMemo(() => consoleDiagnostics(checkSource), [checkSource]);
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && model.getValue() === checkSource) setConsoleMarkers(model, diagnostics);
  }, [editorRef, checkSource, diagnostics]);
  return diagnostics.length;
}

function ProblemsLine({ count }: Readonly<{ count: number }>) {
  const text = count === 0 ? "No attribute dropped on save" : `${count} attribute${count === 1 ? "" : "s"} dropped on save`;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--osio-border-default)] px-3 py-1 text-xs text-[var(--osio-fg-muted)]">
      <span role="status" data-testid="raw-console-problems" className={count === 0 ? "" : "text-[var(--osio-fg-default)]"}>{text}</span>
      <span className="hidden truncate sm:inline">F8: next problem · Ctrl+M: Tab moves focus</span>
    </div>
  );
}

export function RawMonacoPane({ readSource, onChange, checkSource, showLineNumbers }: Readonly<RawMonacoPaneProps>) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useConsoleEditor(hostRef, readSource, onChange);
  const count = useConsoleMarkers(editorRef, checkSource);
  const layoutModes = useLayoutModes();
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model) setConsoleLayoutModes(model, layoutModes);
  }, [editorRef, layoutModes]);
  useEffect(() => { editorRef.current?.updateOptions({ lineNumbers: showLineNumbers ? "on" : "off" }); }, [editorRef, showLineNumbers]);
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--osio-bg-surface)]">
      <div ref={hostRef} className="min-h-0 flex-1" />
      <ProblemsLine count={count} />
    </div>
  );
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ThemeJsonView.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { isThemesEnabled } from "@/shared/config/featureFlags";
import { parseThemeJsonPageId } from "@/widgets/workspace-grid/model/layoutPersist";
import { editor, KeyCode, KeyMod, MarkerSeverity, Uri } from "@/features/ide/model/monacoRuntime";
import { OSIO_THEME, watchEditorTheme } from "@/features/ide/ui/monacoTheme";
import { replaceEditorText } from "@/features/ide/ui/useMonacoEditor";
import { ensureJsonLanguage, setJsonSchema } from "../model/monacoJson";
import { buildThemeSchema } from "../model/themeSchema";
import { findJsonKeyRange } from "../model/jsonKeyRange";
import { useJsonDraft } from "../model/useJsonDraft";
import { themeDraftConfig } from "../model/themeDraftConfig";
import type { DraftConfig } from "../model/useJsonDraft";
import type { ThemeDoc } from "@/shared/config/themeDoc";
import { liveContrastIssues } from "../model/liveContrast";
import { ThemeEditorToolbar } from "./ThemeEditorToolbar";
import { themeSlug } from "../../../../scripts/bridge-theme-rules.mjs";
import { listThemes } from "@/features/theme/model/useThemeLibrary";
import { isShippedThemeName } from "@/shared/config/themes";

function Notice({ children }: { children: string }) {
  return (
    <div role="status" className="flex h-full items-center justify-center p-6 text-sm text-[var(--osio-fg-muted)]">
      {children}
    </div>
  );
}

const dummyConfig: DraftConfig<ThemeDoc> = {
  draftKey: "osionos:theme-draft:dummy",
  initialText: () => "",
  parse: () => ({ doc: null, issues: [] }),
  preview: () => undefined,
  restore: () => undefined,
  save: () => ({ ok: false as const, message: "no theme" }),
};

export function ThemeJsonEditor({ pageId }: { pageId: string }) {
  // A new target object per render would rebuild the config, and with it the
  // draft, whose creation notifies: React then loops ("Too many re-renders").
  const target = React.useMemo(() => parseThemeJsonPageId(pageId), [pageId]);
  const config = React.useMemo(() => (target ? themeDraftConfig(target, pageId) : dummyConfig), [target, pageId]);
  const draft = useJsonDraft(config);
  const draftRef = React.useRef(draft);
  draftRef.current = draft;

  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<editor.IStandaloneCodeEditor | null>(null);
  const modelRef = React.useRef<editor.ITextModel | null>(null);

  const shipped = React.useMemo(() => {
    if (!target || target.kind !== "theme") return false;
    const name = listThemes().find((theme) => themeSlug(theme.name) === target.slug)?.name ?? target.slug;
    return isShippedThemeName(name);
  }, [target]);

  const openedName = React.useMemo(() => {
    if (!target || target.kind !== "theme") return "";
    return listThemes().find((theme) => themeSlug(theme.name) === target.slug)?.name ?? target.slug;
  }, [target]);

  React.useEffect(() => {
    if (!isThemesEnabled() || !target) return;
    ensureJsonLanguage();
    const host = hostRef.current;
    if (!host) return;
    const modelUri = Uri.from({ scheme: "osionos", authority: "theme", path: `/${encodeURIComponent(pageId)}.json` });
    const model = editor.createModel(draft.text, "json", modelUri);
    modelRef.current = model;
    const instance = editor.create(host, { model, theme: OSIO_THEME, automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineHeight: 21 });
    editorRef.current = instance;
    const stopTheme = watchEditorTheme(host);

    const contentDisposable = model.onDidChangeContent(() => {
      draftRef.current?.setText(model.getValue());
    });

    instance.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
      draftRef.current.save();
    });

    return () => {
      contentDisposable.dispose();
      stopTheme();
      instance.dispose();
      model.dispose();
      editorRef.current = null;
      modelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, target]);

  // Markers + schema rebuild after each parse (issues change).
  React.useEffect(() => {
    if (!isThemesEnabled() || !target) return;
    const model = modelRef.current;
    if (!model) return;
    const text = draft.text;
    const markers: editor.IMarkerData[] = [];
    for (const issue of draft.issues) {
      const range = findJsonKeyRange(text, issue.path) ?? null;
      const start = range ? model.getPositionAt(range.start) : { lineNumber: 1, column: 1 };
      const end = range ? model.getPositionAt(range.end) : { lineNumber: 1, column: 2 };
      markers.push({
        severity: issue.severity === "error" ? MarkerSeverity.Error : MarkerSeverity.Warning,
        message: issue.message,
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      });
    }
    // contrast warnings
    try {
      for (const contrast of liveContrastIssues()) {
        const path = ["colors", contrast.fg];
        const range = findJsonKeyRange(text, path);
        const start = range ? model.getPositionAt(range.start) : { lineNumber: 1, column: 1 };
        const end = range ? model.getPositionAt(range.end) : { lineNumber: 1, column: 2 };
        markers.push({
          severity: MarkerSeverity.Warning,
          message: `${contrast.fg} on ${contrast.bg} is ${contrast.ratio.toFixed(2)}:1, under 4.5:1 (WCAG AA)`,
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
          });
      }
    } catch {
      // ignore
    }
    editor.setModelMarkers(model, "osionos-theme", markers);

    const liveValue = (key: string) => getComputedStyle(document.documentElement).getPropertyValue(`--osio-${key}`).trim();
    try {
      setJsonSchema(model.uri.toString(), "osionos://schema/theme.json", buildThemeSchema(liveValue));
    } catch {
      // ignore
    }
  }, [draft.issues, draft.text, target]);


  // The saved text comes from revert itself: `draft.state` is the last render's
  // snapshot, which still holds the edit being thrown away.
  const handleRevert = React.useCallback(() => {
    const savedText = draft.revert();
    const instance = editorRef.current;
    if (instance) replaceEditorText(instance, savedText);
  }, [draft]);

  if (!isThemesEnabled()) return <Notice>Custom themes are turned off.</Notice>;
  const parsedTarget = parseThemeJsonPageId(pageId);
  if (!parsedTarget) return <Notice>This tab does not name a theme.</Notice>;

  return (
    <div className="flex h-full flex-col">
      <ThemeEditorToolbar
        name={openedName || (target?.kind === "new-theme" ? "new-theme" : "theme")}
        problemCount={draft.issues.length}
        restored={draft.restored}
        shipped={shipped}
        onSave={() => draft.save()}
        onRevert={handleRevert}
      />
      <div ref={hostRef} className="min-h-0 flex-1" />
    </div>
  );
}

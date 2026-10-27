/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   themeDraftConfig.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { applyCompiledTheme, applyStoredTheme } from "@/shared/config/themeApply";
import { compileTheme } from "@/shared/config/themeDoc";
import { readStoredPalette, readStoredThemeMode } from "@/shared/config/theme";
import { listThemes, resolveTheme } from "@/features/theme/model/useThemeLibrary";
import { isShippedThemeName } from "@/shared/config/themes";
import { useThemeLibrary } from "@/features/theme/model/useThemeLibrary";
import { parseThemeDoc, type ThemeDoc } from "@/shared/config/themeDoc";
import { themeJsonTab, type ThemeJsonTarget } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { themeSlug } from "../../../../scripts/bridge-theme-rules.mjs";
import type { DraftConfig } from "./useJsonDraft";

function liveValue(key: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(`--osio-${key}`).trim();
}

function findTabAndPane(node: { type?: string; tabs?: Array<{ pageId: string; tabId: string }>; children?: unknown[]; id?: string }, pageId: string): { paneId: string; tabId: string } | null {
  if (node?.type === "pane") {
    const tab = node.tabs?.find((item: { pageId: string; tabId: string }) => item.pageId === pageId);
    if (tab) return { paneId: node.id as string, tabId: tab.tabId };
    return null;
  }
  for (const child of node?.children ?? []) {
    const found = findTabAndPane(child as Parameters<typeof findTabAndPane>[0], pageId);
    if (found) return found;
  }
  return null;
}

function uniqueMyThemeName(): string {
  const existing = new Set(listThemes().map((theme) => theme.name.toLowerCase()));
  if (!existing.has("my theme")) return "My theme";
  let index = 2;
  while (existing.has(`my theme ${index}`.toLowerCase())) index += 1;
  return `My theme ${index}`;
}

function uniqueCopyName(baseName: string): string {
  const existing = new Set(listThemes().map((theme) => theme.name.toLowerCase()));
  const candidate = `${baseName} (copy)`;
  if (!existing.has(candidate.toLowerCase())) return candidate;
  let index = 2;
  while (existing.has(`${baseName} (copy ${index})`.toLowerCase())) index += 1;
  return `${baseName} (copy ${index})`;
}

function currentBase(): "light" | "dark" {
  if (typeof document !== "undefined" && (document.documentElement.dataset.theme === "dark" || document.documentElement.dataset.theme === "light")) {
    return document.documentElement.dataset.theme as "light" | "dark";
  }
  return readStoredThemeMode() === "dark" ? "dark" : "light";
}

function skeletonDoc(): ThemeDoc {
  return {
    name: uniqueMyThemeName(),
    base: currentBase(),
    palette: readStoredPalette(),
    colors: {
      "bg-page": liveValue("bg-page"),
      "fg-default": liveValue("fg-default"),
      accent: liveValue("accent"),
    },
  };
}

function openedNameFor(target: ThemeJsonTarget): string {
  if (target.kind !== "theme") return "";
  const theme = listThemes().find((item) => themeSlug(item.name) === target.slug);
  return theme?.name ?? target.slug;
}

export function themeDraftConfig(target: ThemeJsonTarget, pageId: string): DraftConfig<ThemeDoc> {
  const openedName = openedNameFor(target);

  let initialDoc: ThemeDoc;
  if (target.kind === "theme") {
    const theme = listThemes().find((item) => themeSlug(item.name) === target.slug) ?? resolveTheme(target.slug);
    initialDoc = theme ? (JSON.parse(JSON.stringify(theme)) as ThemeDoc) : skeletonDoc();
  } else if (target.kind === "new-theme") {
    const activeName = useThemeLibrary.getState().activeTheme;
    const activeDoc = activeName ? resolveTheme(activeName) : null;
    initialDoc = activeDoc ? (JSON.parse(JSON.stringify(activeDoc)) as ThemeDoc) : skeletonDoc();
    initialDoc.name = uniqueMyThemeName();
    if (!activeDoc) {
      initialDoc.base = currentBase();
      initialDoc.palette = readStoredPalette();
      initialDoc.colors = {
        "bg-page": liveValue("bg-page"),
        "fg-default": liveValue("fg-default"),
        accent: liveValue("accent"),
      };
    }
  } else {
    initialDoc = { name: "" };
  }

  const initialText = target.kind === "import-theme" ? "{\n  \"name\": \"\"\n}" : JSON.stringify(initialDoc, null, 2);

  return {
    draftKey: `osionos:theme-draft:${pageId}`,
    initialText: () => initialText,
    parse: (text: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        return { doc: null, issues: [{ path: [], message: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`, severity: "error" }] };
      }
      return parseThemeDoc(parsed);
    },
    preview: (doc: ThemeDoc) => {
      applyCompiledTheme(compileTheme(doc));
    },
    restore: () => {
      applyStoredTheme();
    },
    save: (doc: ThemeDoc) => {
      const openedShipped = target.kind === "theme" && isShippedThemeName(openedName);
      let saveDoc = doc;
      let savedName = doc.name;
      if (openedShipped) {
        savedName = uniqueCopyName(openedName);
        saveDoc = { ...doc, name: savedName };
      }
      let previousName: string | undefined;
      if (target.kind === "theme" && !openedShipped && openedName && doc.name !== openedName && !isShippedThemeName(openedName)) {
        previousName = openedName;
      }
      const result = useThemeLibrary.getState().saveTheme(saveDoc, previousName);
      if (!result.ok) {
        const path = /name/i.test(result.message) ? ["name"] : [];
        return { ok: false, message: result.message, path };
      }
      useThemeLibrary.getState().setActiveTheme(savedName);
      const needsReplace = target.kind === "new-theme" || target.kind === "import-theme" || openedShipped || previousName !== undefined;
      if (needsReplace) {
        const layout = useWorkspaceLayout.getState();
        const found = findTabAndPane(layout.root, pageId);
        if (found) {
          layout.replaceTabWith(found.paneId, found.tabId, themeJsonTab({ kind: "theme", slug: themeSlug(savedName) }));
        }
      }
      return { ok: true };
    },
  };
}
